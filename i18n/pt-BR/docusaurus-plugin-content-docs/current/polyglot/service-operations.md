---
title: Chamadas de serviço entre namespaces
description: Publique uma operação de serviço e chame-a de forma durável a partir de outro namespace.
---

# Chamadas de serviço entre namespaces {#cross-namespace-service-calls}

Uma operação de serviço, também chamada de operação Nexus, é a chamada durável suportada entre namespaces do mesmo cluster Durable Workflow. Ela é endereçada pelo namespace de destino e pela combinação endpoint/serviço/operação. Um workflow filho ou sinal comum permanece em seu namespace. Nem o nome de uma fila nem outro idioma alteram essa regra.

## Escolher uma interface suportada {#choose-a-supported-authoring-surface}

| Chamador | Interface publicada | Namespace de destino |
| --- | --- | --- |
| PHP embarcado | `Workflow::serviceOperation()` ou a função auxiliar `serviceOperation()` | `ServiceOperationOptions(targetNamespace: 'billing')` |
| PHP SDK | `WorkflowContext::serviceOperation()` | Opção de array `['namespace' => 'billing']` |
| Python SDK | `yield context.call_nexus_service(...)` | Argumento nomeado `target_namespace='billing'` |
| Rust SDK | A autoria de esperas Nexus não foi publicada | Acompanhada em [Rust SDK #86](https://github.com/durable-workflow/sdk-rust/issues/86). Um rascunho retido não equivale a suporte instalado. |

Use o [exemplo embarcado](../features/service-operations.md) para um workflow Laravel, o [exemplo do PHP SDK](https://php.durable-workflow.com/build/workflows-activities/) para sua API sequencial de worker ou a [referência de workflows Python](https://python.durable-workflow.com/reference/workflow/) para geradores. Antes de implantar um chamador, consulte o contrato de operações de serviço anunciado pelo runtime conectado. Uma API de administração do cliente, sozinha, não comprova suporte pelo worker de workflows.

No PHP SDK, a opção de array é atualmente o caminho de autoria entre namespaces. A opção tipada equivalente é acompanhada em [PHP SDK #193](https://github.com/durable-workflow/sdk-php/issues/193).

## Publicar a operação de destino {#publish-the-target-operation}

O namespace de destino possui endpoint, serviço, operação e worker do handler. Primeiro crie o namespace e execute um worker que registre o tipo de workflow de destino na fila selecionada. Este catálogo usa o namespace `billing`, o tipo `billing.invoice` e a fila `billing`.

Alterações do catálogo exigem credenciais de administrador. O runtime verifica separadamente a autoridade do chamador quando um workflow com lease emite seu comando de serviço.

```bash
curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"endpoint_name":"billing"}'

curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints/billing/services" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"service_name":"invoices"}'

curl --fail-with-body -X POST "$DURABLE_WORKFLOW_SERVER_URL/api/service-endpoints/billing/services/invoices/operations" \
  -H "Authorization: Bearer $DW_ADMIN_TOKEN" \
  -H "X-Namespace: billing" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{"operation_name":"create","operation_mode":"sync","handler_binding_kind":"start_workflow","handler_target_reference":"billing.invoice","handler_binding":{"workflow_type":"billing.invoice","queue":"billing"},"deadline_policy":{"timeout_seconds":30}}'
```

Os nomes do catálogo são normalizados para minúsculas. Os registros de endpoint e serviço organizam a operação, mas não substituem seu handler real. Mantenha um worker compatível disponível no namespace de destino. O registro não comprova que o trabalho foi executado.

## Esperas e resultados registrados {#waiting-and-recorded-results}

O PHP SDK usa por padrão `mode_override=sync` e `wait_for=completed`. Python usa `mode='sync'` e `wait_for='completed'`. Ambos suspendem até o serviço alcançar um desfecho terminal durável e reproduzem o resultado registrado ou a falha tipada na chamada original. Uma chamada pendente ou iniciada não é um resultado de negócio bem-sucedido.

Para aguardar apenas admissão, PHP usa `wait_for='accepted'` ou `mode_override='async'`; Python oferece `wait_for='accepted'`, `mode='async'` e a função auxiliar `start_nexus_operation()`. Preserve o id retornado para inspeção. Uma conclusão posterior não substitui a admissão original registrada do chamador. Aguarde a conclusão quando as decisões do workflow precisarem do resultado do destino.

Limite a execução do serviço pela `deadline_policy` do catálogo, como acima. Ela aceita exatamente um inteiro positivo `timeout_seconds` ou um `deadline_at` RFC3339 com deslocamento de fuso. O runtime registra um único `call_deadline_at` a partir da aceitação original. Replay, tentativas e alterações posteriores do catálogo não o reiniciam. Uma política null não cria um novo prazo para o serviço.

Não use `wait_timeout_seconds` do chamador como timeout de execução. Uma opção de espera de um segundo sem prazo no catálogo ainda pode entregar um destino que termina após três segundos. Depois de um timeout, inspecione a chamada original e o destino vinculado. O vencimento não comprova ausência de efeitos externos; o cancelamento do destino é uma política separada.

## Falhas, tentativas e idempotência {#failures-retries-and-idempotency}

PHP expõe desfechos terminais de falha por `ServiceOperationFailed`; Python lança `NexusOperationFailed` no ponto de yield. Preserve os detalhes tipados e o id da chamada ao tratar um erro. O código do workflow pode tratar falhas de negócio esperadas; as inesperadas podem permanecer como falhas do workflow.

O runtime controla a política registrada de tentativas do serviço. Não acrescente outro laço de tentativas HTTP dentro do código do workflow. PHP e Python derivam chaves estáveis para chamadas comuns. Se a aplicação fornecer uma chave, mantenha o mesmo destino, requisição e operação pretendida durante tentativas e replay. Uma nova chave é outra requisição de negócio, não a recuperação de uma confirmação perdida.

Mantenha estáveis o namespace de destino, a combinação do catálogo, o payload e as opções de espera em históricos abertos. Use uma ramificação de versão do workflow quando essa intenção durável mudar.

## Aplicar a fronteira do namespace {#enforce-the-namespace-boundary}

O padrão entre namespaces é `allow`. Autenticação, verificações de papéis, outras políticas de fronteira e autorização de namespace continuam valendo. A identidade do chamador vem do workflow com lease; a entrada da aplicação não pode se passar por outro namespace chamador.

Para que um PHP Server autogerenciado recuse chamadas entre namespaces, configure e reinicie seus papéis API/worker de maneira consistente:

```bash
DW_SERVICE_BOUNDARY_CROSS_NAMESPACE_DEFAULT=deny
```

A política recusa a chamada entre namespaces antes do despacho do handler. Chamadas dentro do mesmo namespace e outras políticas de fronteira ainda precisam de revisão. Essa variável não substitui credenciais ou ACLs dos locatários.

## Inspecionar a chamada original {#inspect-the-original-call}

Use a [API de detalhes de chamadas e catálogo](./server-api-reference.md#service-catalog-admin-apis) ou a [inspeção de chamadas de serviço no CLI](./cli-reference.md#service-call-inspection). Mantenha juntos os ids de workflow/execução do chamador e da chamada de serviço no destino. A inspeção somente leitura não solicita outra execução. Reutilize o id original ao verificar uma resposta perdida ou a substituição de um worker.
