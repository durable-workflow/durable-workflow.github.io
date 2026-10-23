"""Exercise the guide's Deployment with ordinary published SDK installations."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import tomllib
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).resolve().parent
ARTIFACTS = json.loads((FIXTURE / 'artifacts.json').read_text())
OUTPUT = Path(os.environ['QUALIFICATION_OUTPUT']) if 'QUALIFICATION_OUTPUT' in os.environ else Path(tempfile.mkdtemp(prefix='website336-'))
OUTPUT.mkdir(parents=True, exist_ok=True)
CLUSTER = 'website336-' + os.environ.get('GITHUB_RUN_ID', str(os.getpid()))
NAMESPACE = 'durable-workflow'


def run(args, *, label=None, timeout=180, stdin=None):
    if label:
        print(label + ': running', flush=True)
    result = subprocess.run(args, input=stdin, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=timeout, check=False)
    if label:
        (OUTPUT / (label + '.txt')).write_text(result.stdout)
    if result.returncode:
        raise RuntimeError(f'{args[0:3]} exited {result.returncode}:\n{result.stdout[-6000:]}')
    return result.stdout


def kubectl(*args, **kwargs):
    return run(['kubectl', '--context', 'kind-' + CLUSTER, '-n', NAMESPACE, *args], **kwargs)


def apply(document):
    return kubectl('apply', '-f', '-', stdin=json.dumps(document))


def server():
    environment = {
        'APP_ENV': 'testing', 'APP_DEBUG': 'false', 'APP_VERSION': ARTIFACTS['server_version'],
        'LOG_CHANNEL': 'stderr', 'LOG_LEVEL': 'warning',
        'DB_CONNECTION': 'sqlite', 'DB_DATABASE': '/data/database.sqlite',
        'QUEUE_CONNECTION': 'sync', 'CACHE_STORE': 'array', 'SESSION_DRIVER': 'array',
        'DW_AUTH_DRIVER': 'token', 'DW_AUTH_BACKWARD_COMPATIBLE': 'false',
        'DW_ADMIN_TOKEN': 'website336-control', 'DW_WORKER_TOKEN': 'website336-worker',
        'DW_TASK_DISPATCH_MODE': 'poll',
        'DW_SERVER_KEY': 'base64:' + 'd2Vic2l0ZTMzNi1maXh0dXJlLWtleS0wMDAwMDAwMDA=',
    }
    common = {'image': ARTIFACTS['server'],
              'env': [{'name': key, 'value': value} for key, value in environment.items()],
              'volumeMounts': [{'name': 'data', 'mountPath': '/data'}]}
    api = {**common, 'name': 'server', 'ports': [{'containerPort': 8080}],
           'readinessProbe': {'httpGet': {'path': '/api/ready', 'port': 8080},
                              'periodSeconds': 2, 'failureThreshold': 60}}
    # A real scheduler drives ordinary timeout/recovery work. This ephemeral
    # SQLite fixture is not a production Server installation or HA rehearsal.
    scheduler = {**common, 'name': 'scheduler', 'command': ['sh', '-ec',
        'while true; do php artisan schedule:evaluate --limit=100 --json; '
        'php artisan workflow:v2:repair-pass --json; sleep 1; done']}
    apply({'apiVersion': 'apps/v1', 'kind': 'Deployment',
           'metadata': {'name': 'durable-workflow-server', 'namespace': NAMESPACE},
           'spec': {'replicas': 1, 'selector': {'matchLabels': {'app': 'fixture-server'}},
                    'template': {'metadata': {'labels': {'app': 'fixture-server'}},
                                 'spec': {'initContainers': [{**common, 'name': 'bootstrap',
                                           'command': ['server-bootstrap']}],
                                          'containers': [api, scheduler],
                                          'volumes': [{'name': 'data', 'emptyDir': {}}]}}}})
    apply({'apiVersion': 'v1', 'kind': 'Service',
           'metadata': {'name': 'durable-workflow-server', 'namespace': NAMESPACE},
           'spec': {'selector': {'app': 'fixture-server'},
                    'ports': [{'port': 8080, 'targetPort': 8080}]}})


def collect(*, show_logs=False):
    for kind in ['pods', 'deployments', 'events']:
        try:
            kubectl('get', kind, '-o', 'json', label=kind)
        except RuntimeError:
            pass
    try:
        pods = json.loads(kubectl('get', 'pods', '-o', 'json'))['items']
        for pod in pods:
            for container in pod['spec'].get('initContainers', []) + pod['spec']['containers']:
                try:
                    logs = kubectl('logs', pod['metadata']['name'], '-c', container['name'],
                                   label=pod['metadata']['name'] + '-' + container['name'])
                    if show_logs:
                        errors = [line[:3000] for line in logs.splitlines()
                                  if any(token in line for token in ['ERROR:', 'CRITICAL:', 'SQLSTATE', 'Fatal error', 'Error:'])]
                        print('Pod ' + pod['metadata']['name'] + ' / ' + container['name'] + ':\n'
                              + '\n'.join(errors[:4]) + '\n' + logs[-3000:], flush=True)
                except RuntimeError:
                    pass
    except RuntimeError:
        pass


def main():
    images = {}
    for sdk in ['php', 'python', 'rust']:
        image = 'website336-' + sdk + ':' + CLUSTER
        run(['docker', 'build', '--build-arg', 'SDK_VERSION=' + ARTIFACTS[sdk + '_sdk'],
             '--tag', image, str(FIXTURE / sdk)], label=sdk + '-build', timeout=900)
        images[sdk] = image
    php_lock = json.loads(run(['docker', 'run', '--rm', '--entrypoint', 'cat', images['php'], '/app/composer.lock'], label='php-lock'))
    php_sdk = next(item for item in php_lock['packages'] if item['name'] == 'durable-workflow/sdk')
    assert php_sdk['source']['reference'] == ARTIFACTS['php_source']
    assert php_sdk['dist']['reference'] == ARTIFACTS['php_source']
    assert php_sdk['version'].lstrip('v') == ARTIFACTS['php_sdk']
    rust_lock = run(['docker', 'run', '--rm', '--entrypoint', 'cat', images['rust'], '/app/Cargo.lock'], label='rust-lock')
    rust_sdk = next(item for item in tomllib.loads(rust_lock)['package'] if item['name'] == 'durable-workflow')
    assert rust_sdk['version'] == ARTIFACTS['rust_sdk']
    assert rust_sdk['checksum'] == ARTIFACTS['rust_checksum']
    python_report = json.loads(run(['docker', 'run', '--rm', '--entrypoint', 'cat', images['python'], '/app/install-report.json'], label='python-install-report'))
    python_sdk = next(item for item in python_report['install'] if item['metadata']['name'] == 'durable-workflow')
    assert python_sdk['metadata']['version'] == ARTIFACTS['python_sdk']
    created = False
    complete = False
    try:
        created = True
        run(['kind', 'create', 'cluster', '--name', CLUSTER, '--image', ARTIFACTS['kind_node'],
             '--wait', '180s'], label='kind-create', timeout=300)
        kubectl('create', 'namespace', NAMESPACE)
        kubectl('create', 'secret', 'generic', 'orders-worker-auth', '--from-literal=token=website336-worker')
        server()
        kubectl('rollout', 'status', 'deployment/durable-workflow-server', '--timeout=180s', label='server-ready', timeout=200)
        source = (ROOT / 'docs/deployment.md').read_text()
        manifest = source.split('{#sdk-workers-on-kubernetes}', 1)[1].split('```yaml\n', 1)[1].split('```', 1)[0]
        (OUTPUT / 'documented-worker.yaml').write_text(manifest)
        template = json.loads(kubectl('create', '--dry-run=client', '-f', '-', '-o', 'json', stdin=manifest))
        for sdk, image in images.items():
            run(['kind', 'load', 'docker-image', '--name', CLUSTER, image], label=sdk + '-load', timeout=180)
            document = json.loads(json.dumps(template))
            name = 'orders-' + sdk
            document['metadata']['name'] = name
            document['spec']['selector']['matchLabels']['app'] = name
            document['spec']['template']['metadata']['labels']['app'] = name
            container = document['spec']['template']['spec']['containers'][0]
            container['image'] = image
            for value in container['env']:
                if value['name'] == 'DW_TASK_QUEUE':
                    value['value'] = name
            apply(document)
            kubectl('rollout', 'status', 'deployment/' + name, '--timeout=90s', timeout=110)
        apply({'apiVersion': 'v1', 'kind': 'Pod', 'metadata': {'name': 'controller', 'namespace': NAMESPACE},
               'spec': {'containers': [{'name': 'controller', 'image': images['python'],
                         'command': ['sleep', 'infinity'], 'env': [
                             {'name': 'DW_SERVER_URL', 'value': 'http://durable-workflow-server.durable-workflow.svc.cluster.local:8080'},
                             {'name': 'DW_NAMESPACE', 'value': 'default'}]}]}})
        kubectl('wait', '--for=condition=Ready', 'pod/controller', '--timeout=60s')
        receipt = json.loads(kubectl('exec', 'controller', '--', 'python', '/app/verify.py', label='completed-workflows', timeout=240))
        collect()
        for sdk in images:
            pods = json.loads(kubectl('get', 'pods', '-l', 'app=orders-' + sdk, '-o', 'json'))['items']
            streams = []
            for pod in pods:
                logfile = OUTPUT / (pod['metadata']['name'] + '-shutdown.txt')
                stream = logfile.open('w')
                process = subprocess.Popen(['kubectl', '--context', 'kind-' + CLUSTER, '-n', NAMESPACE,
                                            'logs', '-f', pod['metadata']['name']], stdout=stream, stderr=subprocess.STDOUT)
                streams.append((process, stream, logfile))
            time.sleep(1)
            started = time.monotonic()
            kubectl('scale', 'deployment/' + 'orders-' + sdk, '--replicas=0')
            kubectl('wait', '--for=delete', 'pod', '-l', 'app=orders-' + sdk, '--timeout=90s', timeout=100)
            for process, stream, logfile in streams:
                process.wait(timeout=10)
                stream.close()
                assert '"worker_stopped"' in logfile.read_text(), logfile
            receipt[sdk + '_idle_shutdown_seconds'] = time.monotonic() - started
        receipt.update(json.loads(kubectl('exec', 'controller', '--', 'python', '/app/verify.py', 'retired', label='deregistered-workers', timeout=45)))
        receipt['artifacts'] = ARTIFACTS
        receipt['documented_manifest_sha256'] = hashlib.sha256(manifest.encode()).hexdigest()
        (OUTPUT / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps(receipt))
        complete = True
    finally:
        if created:
            collect(show_logs=not complete)
            run(['kind', 'delete', 'cluster', '--name', CLUSTER], label='kind-delete', timeout=120)


if __name__ == '__main__':
    main()
