---
sidebar_position: 4
title: Início rápido de Rust no Cloud
description: Execute o playground Rust compartilhado da Sample App em um namespace provisionado do Durable Workflow Cloud.
tags:
  - Rust
  - Cloud
  - quickstart
  - workers
keywords:
  - início rápido de Rust no Cloud
  - URL do runtime do namespace
  - worker Rust
  - playground da Sample App
---

# Início rápido de Rust no Cloud {#rust-cloud-quickstart}

:::caution Acesso antecipado controlado

O Durable Workflow Cloud está disponível por acesso antecipado controlado. Use
este guia somente depois que o Cloud provisionar um namespace e duas
credenciais de runtime com escopo por papel. O caminho Rust disponível
publicamente não exige Cloud; comece pelo [guia do SDK Rust](./rust.md) ou
execute `scripts/playground rust` no runtime local padrão do playground.

:::

A Sample App oferece um playground simétrico para PHP, Python e Rust. Esta
página seleciona Rust e altera somente o runtime de destino. Os caminhos dos
SDKs [PHP](./php.md) e [Python](./python.md) usam o mesmo comando com `php` ou
`python`; o [contrato do playground da Sample App](https://github.com/durable-workflow/sample-app/blob/main/README.md#symmetric-sdk-playground)
documenta as três opções.

O playground resolve as versões estáveis atuais dos artefatos a partir dos
metadados gerenciados por máquina da Sample App. Use essas versões geradas em
vez de copiar números de versão para estes comandos ou adicionar uma etapa
separada de instalação do SDK.

## 1. Abrir a Sample App preparada {#1-open-the-prepared-sample-app}

[Crie um Codespace a partir da branch `main` da Sample App](https://codespaces.new/durable-workflow/sample-app?quickstart=1&ref=main),
aguarde a conclusão da configuração e abra um terminal na raiz do repositório.
A imagem preparada contém as ferramentas dos SDKs e o `dw` exigidos pelo
playground compartilhado.

O Cloud fornece a URL do runtime, o namespace do runtime e duas credenciais por
papel. Escolha uma fila de tarefas da aplicação e exporte estes placeholders
somente após substituí-los pelos valores correspondentes:

```bash
export DURABLE_WORKFLOW_RUNTIME_URL='<provisioned-runtime-url>'
export DURABLE_WORKFLOW_RUNTIME_NAMESPACE='<provisioned-runtime-namespace>'
export DURABLE_WORKFLOW_CLIENT_TOKEN='<client-runtime-credential>'
export DURABLE_WORKFLOW_WORKER_TOKEN='<worker-runtime-credential>'
export DURABLE_WORKFLOW_TASK_QUEUE='<rust-task-queue>'
```

A URL do runtime é a raiz do runtime do namespace retornada pelo Cloud. Ela
deve ser uma URL HTTPS absoluta sem consulta, fragmento ou `/api` no final; o
SDK e a CLI acrescentam suas próprias rotas da API. O namespace do runtime é o
valor separado retornado com essa URL, não um nome inferido de seu caminho.

A credencial de cliente inicia, descreve e lê workflows. A credencial de worker
registra, faz poll, envia heartbeats e conclui tarefas. Elas devem ser segredos
distintos com escopo por papel, embora este único comando inicie ambos os
processos filhos. Uma chave de administração do Cloud gerencia namespaces e
credenciais; não a exporte nem a passe como qualquer uma das credenciais de runtime.

## 2. Executar o caminho Rust {#2-run-the-rust-journey}

Execute o contrato compartilhado para runtime externo:

```bash
scripts/playground rust --runtime managed \
  --runtime-url "$DURABLE_WORKFLOW_RUNTIME_URL" \
  --namespace "$DURABLE_WORKFLOW_RUNTIME_NAMESPACE" \
  --task-queue "$DURABLE_WORKFLOW_TASK_QUEUE"
```

O comando cria os arquivos ausentes em `.playground/rust` sem substituir
código-fonte pertencente ao chamador. Ele imprime o tipo efetivo de workflow,
tipo de atividade, fila, comando do worker, comando do cliente, entrada e
resultado esperado antes de iniciar qualquer coisa. O worker recebe apenas a
credencial de worker; depois que seu registro exato fica visível, o cliente
recebe apenas a credencial de cliente.

A espera pelo registro é limitada a 60 segundos. Não trate apenas o início do
processo como prontidão. Continue somente após o comando imprimir um checkpoint
com este formato (as identidades são ilustrativas):

```text
Worker ready: target=managed runtime_url=<provisioned-runtime-url> namespace=<provisioned-runtime-namespace> id=<worker-id> queue=<rust-task-queue> workflow_type=sample-app.playground.rust.authored-workflow activity_type=sample-app.playground.rust.authored-activity
```

O mesmo comando inicia um workflow, aguarda até 120 segundos pelo resultado do
cliente SDK, confirma `status=completed` com `dw` e verifica o histórico exigido
do workflow e da atividade. Um resultado bem-sucedido tem esta aparência:

```text
Completed rust workflow <workflow-id>: {"greeting":"Hello, Durable Workflow, from the Sample App Rust playground","input":{"name":"Durable Workflow"},"activity_runtime":"rust","workflow_runtime":"rust"}
```

A linha final `Playground success` repete o runtime de destino, namespace,
fila, tipos registrados e formato esperado do resultado sem valores de
credenciais. O comando também grava
`storage/app/playground-rust-evidence.json` com as versões selecionadas dos
artefatos, registro exato, identidade de workflow/execução, status `completed`,
resultado e tipos de eventos do histórico. O Managed Waterline continua sendo
a interface de operação do namespace provisionado; o caminho gerenciado não
inicia um Server ou Waterline local.

## Diagnóstico limitado {#bounded-diagnosis}

Se o checkpoint `Worker ready` não aparecer em 60 segundos, comece pelo contrato
efetivo impresso acima do erro:

- **Fila divergente:** o executor consulta o valor exato passado a
  `--task-queue`. Confirme que o Cloud admite essa fila e que o registro
  impresso usa o mesmo valor; depois execute novamente o mesmo comando.
- **Tipo divergente:** o erro nomeia os tipos de workflow e atividade que o
  worker deve anunciar. Compare-os com o contrato efetivo. Se arquivos do
  chamador contiverem registros antigos fixos no código, atualize-os ou
  comprove o scaffold atual em um novo diretório com
  `--source "$HOME/durable-rust-worker"`.
- **Papel de credencial divergente:** falha de autorização antes do registro
  aponta para a credencial de worker; ao descrever ou iniciar a execução,
  aponta para a credencial de cliente. Não troque os valores nem substitua
  qualquer um por uma chave de administração do Cloud.
- **Runtime divergente:** ambos os papéis devem usar a URL exata e o namespace
  exato do runtime provisionado. Remova `/api` do final; não substitua pela URL
  de administração do Cloud ou por uma URL de Server sob sua administração.

Se o registro funcionar, mas a conclusão falhar, guarde a identidade de
workflow/execução impressa. Inspecione essa execução selecionada no Managed
Waterline e compare seu tipo pendente de workflow ou atividade e sua fila com o
contrato efetivo. Corrija a divergência antes de iniciar outra execução. O
caminho de evidências retidas e a saída limitada do worker identificam se
falhou a verificação do resultado do cliente, do status durável, do resultado
esperado ou do histórico exigido.

Volte ao [guia geral do SDK Rust](./rust.md) ou use a
[referência gerada da API Rust](https://rust.durable-workflow.com/durable_workflow/)
para tipos e métodos individuais.
