import asyncio
import json
import os
import sys
import uuid
from pathlib import Path

from durable_workflow import Client


async def main():
    async with Client(
        os.environ["DW_SERVER_URL"],
        namespace=os.environ["DW_NAMESPACE"],
        token="website336-control",
        timeout=5,
    ) as client:
        if len(sys.argv) > 1 and sys.argv[1] == "retired":
            registered = json.loads(Path('/tmp/website336-workers.json').read_text())
            async with asyncio.timeout(30):
                while True:
                    present = {worker.worker_id for worker in (await client.list_workers()).workers}
                    if not (present & set(registered)):
                        break
                    await asyncio.sleep(0.2)
            print(json.dumps({"deregistered_worker_ids": registered}))
            return
        receipts = []
        worker_ids = []
        for sdk in ["php", "python", "rust"]:
            observed = []
            try:
                async with asyncio.timeout(40):
                    while True:
                        roster = await client.list_workers(task_queue="orders-" + sdk)
                        observed = [worker.worker_id for worker in roster.workers]
                        if len(observed) == 2:
                            break
                        await asyncio.sleep(0.2)
            except TimeoutError as error:
                raise AssertionError(f'{sdk}: expected two registered Pod workers, observed {observed}') from error
            ids = [worker.worker_id for worker in roster.workers]
            assert len(set(ids)) == 2, ids
            worker_ids.extend(ids)
            workflow_id = "website336-" + sdk + "-" + uuid.uuid4().hex
            handle = await client.start_workflow(
                workflow_type="website336.echo", task_queue="orders-" + sdk,
                workflow_id=workflow_id, input=["Kubernetes"],
                run_timeout_seconds=60, execution_timeout_seconds=60,
            )
            result = await handle.result(timeout=45)
            assert result["sdk"] == sdk and result["name"] == "Kubernetes", result
            assert result["worker_id"] in ids, result
            receipts.append({"sdk": sdk, "registered_worker_ids": ids, "workflow_id": workflow_id, "run_id": handle.run_id, "result": result})
        Path('/tmp/website336-workers.json').write_text(json.dumps(worker_ids))
        print(json.dumps({"completed_workflows": receipts}))


if __name__ == "__main__":
    asyncio.run(main())
