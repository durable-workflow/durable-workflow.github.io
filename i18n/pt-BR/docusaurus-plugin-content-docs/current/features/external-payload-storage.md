---
sidebar_position: 21
tags:
  - payloads
  - armazenamento
  - histórico
keywords:
  - armazenamento externo de payloads
  - payloads grandes
  - transferência de payloads
  - armazenamento S3
  - armazenamento GCS
  - armazenamento Azure Blob
---

# Armazenamento externo de payloads {#external-payload-storage}

No Laravel embutido, o armazenamento externo substitui valores codificados grandes no histórico do workflow por referências verificadas ao armazenamento da aplicação. Esta página descreve esse limite. Clientes e workers em modo serviço usam o [transporte do runtime do Server](../polyglot/server-api-reference.md#runtime-external-payload-transport): o Server mantém as credenciais do provedor e os SDKs trocam identificadores opacos por HTTP autenticado. Um URI do provedor não é um envelope de payload válido para o Server.

## Quando usar {#when-to-use-it}

Use armazenamento externo para documentos, mídia, relatórios, argumentos ou resultados de atividades grandes que realmente precisem passar pela execução durável. Valores pequenos permanecem inline e dispensam escrita no armazenamento de objetos. A externalização não remove limites de payload, eventos de histórico nem a necessidade de limitar os objetos retidos por execução.

## Como funciona a externalização {#how-offload-works}

A política do namespace da aplicação fornece um driver e um `threshold_bytes` positivo. Payloads codificados cujo tamanho é **maior que** o limite são gravados pelo driver. Valores iguais ou inferiores permanecem inline. Uma política desativada ou sem driver também mantém os valores inline.

A referência de provedor do modo embutido usa o esquema `durable-workflow.v2.external-payload-reference.v1` com `uri`, `sha256`, `size_bytes`, `codec` e `expires_at` opcional. O codec é `avro`. `Workflow\V2\Support\ExternalPayloads` armazena o envelope codificado com o prefixo `dw-external-payload:v1:`. Quando precisa do valor, o runtime busca os bytes codificados e verifica tamanho e SHA-256 antes de decodificar. Bytes ausentes ou alterados causam falha, nunca um valor `null` substituto.

Essa referência difere do esquema do Server `durable-workflow.v2.runtime-external-payload-reference.v1`. Consulte a [tabela de suporte por modo](../polyglot/server-api-reference.md#external-payload-support-by-mode) antes de transportar um helper de driver ou envelope armazenado entre modos de implantação.

## Limite de confiança da decodificação {#decode-trust-boundary}

Armazenamento e decodificação têm limites de confiança distintos. Um provedor pode guardar bytes codificados enquanto um worker, servidor de codecs ou ferramenta de exportação que os decodifica pode ver os valores da aplicação. Defina onde os decodificadores executam, quais chaves acessam e como dados são ocultados em prévias e logs. Hashes, tamanhos e nomes de codecs são metadados de integridade, não uma garantia de criptografia ponta a ponta. URIs do provedor também podem conter nomes de objetos sensíveis.

## Opções de driver {#driver-choices}

| Driver | Esquema URI | Requisito no modo embutido |
| --- | --- | --- |
| Sistema de arquivos local | `file://` | Todo processo embutido que resolve uma referência deve acessar a mesma raiz de armazenamento. |
| Armazenamento compatível com S3 | `s3://` | Driver ou disco da aplicação com bucket, prefixo e credenciais adequados. |
| Google Cloud Storage | `gs://` | Driver ou disco da aplicação e cliente do provedor. |
| Azure Blob Storage | `azure://` | Driver ou disco da aplicação e cliente do provedor. |

O Server pode usar armazenamento local enquanto workers SDK remotos buscam dados por HTTP. Esses workers não precisam de sistema de arquivos compartilhado nem de credenciais do provedor.

## Configurar um namespace {#configuring-a-namespace}

Aplicações embutidas configuram a política de armazenamento do namespace e `ExternalPayloadStorageDriver` no próprio runtime Laravel. Mantenha credenciais na configuração da aplicação, não em argumentos de workflow, histórico ou URIs de referências. Use uma política consistente nos processos que executam e fazem replay da execução.

No Server auto-hospedado, a [API administrativa de armazenamento](../polyglot/server-api-reference.md#namespace-and-storage) e os [comandos CLI](../polyglot/cli-reference.md#namespace-and-search-attribute-commands) configuram a política do Server. Eles não concedem acesso direto ao provedor aos workers SDK.

### Pela CLI {#with-the-cli}

`dw namespace:set-storage-driver` configura um namespace do Server, não o contêiner Laravel de uma aplicação embutida independente. Os parâmetros obrigatórios de disco, bucket e prefixo estão na referência da CLI.

### Pela API do Server {#with-the-server-api}

`PUT /api/namespaces/{namespace}/external-storage` é uma operação administrativa de política. Clientes SDK normais descobrem o transporte resultante por `GET /api/cluster/info`; não copiam sua configuração do provedor para os workers.

## Verificar a política {#verifying-the-policy}

Exercite um valor acima do limite com o driver configurado e os processos que farão replay. Verifique o comprimento exato dos bytes codificados e SHA-256 após a busca. Para o Server, `dw storage:test --namespace=billing --json` verifica o caminho configurado. Um diagnóstico de armazenamento não comprova execução de workflows em cada SDK, restauração de backups nem todos os adaptadores de provedores.

## Escolher um limite {#picking-a-threshold}

Deixe margem em relação aos limites normais de solicitações e payloads. O limite se aplica a **bytes codificados**, não ao tamanho do arquivo original ou JSON de negócio. Limites muito baixos acrescentam solicitações de armazenamento e referências retidas para valores pequenos. O transporte do runtime também pode externalizar valores adicionais para que uma solicitação HTTP agregada caiba no limite. No modo serviço, use os limites descobertos do Server, não o limite embutido como limite do protocolo.

## Replay, retenção e limpeza {#replay-retention-and-cleanup}

- **Integridade do replay.** Um valor só é decodificado após buscar e verificar seus bytes. Preserve os objetos ainda necessários a qualquer execução retida.
- **Cache de buscas verificadas.** `ExternalPayloadStorage` limita seu cache de bytes verificados. Limpá-lo não exclui o objeto nem altera sua propriedade.
- **Retenção.** A limpeza do runtime considera proprietários retidos e objetos compartilhados. Falhas de armazenamento, retenções para backup ou referências restantes podem atrasar a exclusão. Executar a retenção não garante ausência de objetos órfãos.
- **Exportação do histórico.** Uma exportação pode preservar metadados de referências sem buscar o objeto. Seu checksum ou `history_complete` não comprova a existência dos bytes externos nem que o arquivo pode ser reproduzido. Respeite o [limite de backup e restauração](../configuration/pruning-workflows.md#export-before-pruning) e verifique objetos separadamente. Arquivos autossuficientes continuam em [Server #520](https://github.com/durable-workflow/server/issues/520).

## Uso por código {#using-it-from-code}

PHP embutido usa `Workflow\V2\Support\ExternalPayloadStorage` com um `ExternalPayloadStorageDriver`. `LocalFilesystemExternalPayloadStorage` lida com raízes locais. Adaptadores de provedor controlam suas configurações de acesso e regras URI. Normalmente, a aplicação permite que o runtime aplique a política do namespace, em vez de construir envelopes armazenados manualmente.

No modo serviço, clientes e workers dos SDKs PHP, Python e Rust enviam e buscam payloads automaticamente quando o Server anuncia um transporte disponível. Não envie um envelope de provedor `external_storage` ao Server nem exclua objetos gerenciados pelo Server com um helper direto. Consulte o [contrato de envio e busca](../polyglot/server-api-reference.md#runtime-external-payload-transport) e o [limite dos helpers Python](../polyglot/python.md#external-payload-storage).

## Veja também {#see-also}

- [Passagem de dados](../defining-workflows/passing-data.md)
- [Limites estruturais: tamanho do payload](../constraints/structural-limits.md#payload-size)
- [API do Server: transporte de payloads externos](../polyglot/server-api-reference.md#runtime-external-payload-transport)
- [SDK Python: armazenamento externo de payloads](../polyglot/python.md#external-payload-storage)
