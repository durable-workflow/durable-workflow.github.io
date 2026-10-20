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

O armazenamento externo de payloads transfere payloads grandes de workflows
para um armazenamento de objetos substituível (S3, GCS, Azure Blob ou sistema
de arquivos local) e substitui os bytes embutidos no histórico por um envelope
de referência pequeno e verificável. Use quando argumentos ou resultados de
atividades ou workflows filhos, sinais ou payloads de atualização forem grandes
demais para ficar embutidos na linha de banco que mantém o histórico do workflow.

O runtime mantém os payloads embutidos enquanto o tamanho codificado fica
abaixo do limite do namespace. Somente payloads que atingem o limite são
gravados pelo driver configurado e registrados no histórico como um envelope
`durable-workflow.v2.external-payload-reference.v1`. O replay e a exportação
de histórico falham sem prosseguir quando uma referência está ausente,
alterada ou fora do prefixo configurado. O sistema nunca substitui
silenciosamente um blob ausente por um valor vazio.

## Quando usar {#when-to-use-it}

Prefira armazenamento externo de payloads sempre que a aplicação precisar
legitimamente passar mais de algumas centenas de kilobytes por um workflow:

- Pipelines de processamento de documentos e mídia que passam PDFs, imagens
  ou blobs de áudio de uma atividade para a próxima.
- Relatórios, exportações ou arquivos cuja saída final é um artefato
  serializado grande.
- Payloads de fluxos de mensagens produzidos por sistemas externos que não
  expõem uma URL estável de objeto que o workflow possa referenciar diretamente.
- Qualquer payload que, de outra forma, atingiria o
  [limite estrutural `payload_size_bytes`](../constraints/structural-limits.md#payload-size).

Payloads pequenos, como campos do plano de controle, IDs, indicadores de status
e JSON típico, continuam embutidos sem custo adicional. A política depende do
limite, portanto habilitar armazenamento externo em um namespace não move payloads pequenos.

## Como a transferência funciona {#how-offload-works}

Cada namespace tem uma política independente de armazenamento externo de
payloads. Quando o runtime codifica um payload para armazenamento durável,
compara seu tamanho em bytes codificados com o `threshold_bytes` configurado:

- O tamanho codificado está abaixo do limite. O payload é armazenado
  embutido, como atualmente. Nada muda no histórico.
- O tamanho codificado é igual ou superior ao limite. O runtime entrega os
  bytes codificados ao driver configurado, recebe uma URI gerenciada pelo
  driver e registra uma referência de payload externo no histórico. A
  referência contém a URI, um hash SHA-256, o tamanho exato em bytes, o codec
  do payload e uma indicação opcional `expires_at`.

No replay, workers buscam os bytes referenciados pelo mesmo driver, verificam
se o objeto retornado tem o tamanho e SHA-256 esperados e só então entregam
o payload ao decodificador. Uma divergência de tamanho ou hash lança
`ExternalPayloadIntegrityException` (PHP) ou `ExternalPayloadIntegrityError`
(Python) e aparece como falha de replay, nunca como um payload vazio silencioso.

O envelope de referência é um formato de transmissão estável. Ele é idêntico
quando produzido por um workflow PHP, um worker do SDK Python ou um chamador
direto da API HTTP. Para o contrato completo dos campos, consulte
[Envelope de referência de payload externo](../polyglot/server-api-reference.md#external-payload-reference-envelope).

## Limite de confiança da decodificação {#decode-trust-boundary}

Armazenamento e decodificação de payloads são limites de confiança separados.
Um armazenamento de objetos pode manter bytes codificados ou referências,
enquanto um servidor de codec, decodificador personalizado, processo de worker
ou ferramenta de exportação de histórico que decodifique esses bytes pode
ver payloads da aplicação em texto simples.

Trate todo servidor de codec como um limite de confiança gerenciado pelo
cliente: decida onde ele executa, qual rede pode acessá-lo, a quais chaves
tem acesso, quais logs de auditoria emite e como as prévias decodificadas
têm dados ocultados antes de chegar às interfaces do operador. O Durable
Workflow registra nomes de codecs, URIs de referência, hashes, tamanhos,
impressões digitais de schema e prévias limitadas, mas esses fatos não equivalem
a criptografia de ponta a ponta.

## Opções de driver {#driver-choices}

| Driver | Esquema de URI | Uso típico |
| --- | --- | --- |
| `local` | `file://` | Desenvolvimento local, CI e implantações em nó único onde servidor e workers compartilham um sistema de arquivos. Inadequado quando workers executam em hosts diferentes do servidor. |
| `s3` | `s3://` | Amazon S3 e armazenamentos de objetos compatíveis com S3 (MinIO, Cloudflare R2 etc.) por um disco de sistema de arquivos do servidor. |
| `gcs` | `gs://` | Google Cloud Storage por um disco de sistema de arquivos do servidor. |
| `azure` | `azure://` | Azure Blob Storage por um disco de sistema de arquivos do servidor. |

Drivers de armazenamento de objetos configuram as credenciais reais do
bucket ou contêiner por um disco nomeado de sistema de arquivos do servidor.
Assim, segredos ficam na configuração do servidor, fora do registro de política do namespace.

## Configuração de um namespace {#configuring-a-namespace}

Configure a política com a [CLI](../polyglot/cli-reference.md#namespace-and-search-attribute-commands)
ou a [API HTTP do servidor](../polyglot/server-api-reference.md#namespace-and-storage).
Ambas gravam o mesmo envelope `external_payload_storage` no registro do namespace.

### Pela CLI {#with-the-cli}

```bash
# Production namespace using Amazon S3 through the 'external-payload-objects' disk.
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --prefix=billing/ \
  --threshold-bytes=2097152

# Development namespace using the local filesystem.
dw namespace:set-storage-driver dev local \
  --uri=file:///var/lib/durable-workflow/payloads

# Disable offload while keeping the policy record (all payloads stay inline).
dw namespace:set-storage-driver billing s3 \
  --disk=external-payload-objects \
  --bucket=dw-payloads \
  --disable
```

### Pela API do servidor {#with-the-server-api}

```bash
curl -sS -X PUT "$DURABLE_WORKFLOW_SERVER_URL/api/namespaces/billing/external-storage" \
  -H "Authorization: Bearer $DURABLE_WORKFLOW_AUTH_TOKEN" \
  -H "X-Durable-Workflow-Control-Plane-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "driver": "s3",
    "threshold_bytes": 2097152,
    "config": {
      "disk": "external-payload-objects",
      "bucket": "dw-payloads",
      "prefix": "billing/"
    }
  }'
```

A descrição do namespace retornada por `GET /api/namespaces/{name}` ou
`dw namespace:describe` contém o envelope resolvido `external_payload_storage`,
para que operadores e automações verifiquem a política ativa sem repetir uma gravação.

## Verificação da política {#verifying-the-policy}

Use o diagnóstico de ida e volta para comprovar que uma política configurada
pode realmente gravar e ler bytes com as credenciais do namespace antes de
abri-lo ao tráfego de workflows:

```bash
dw storage:test --namespace=billing --large-bytes=2097152 --json
```

O diagnóstico grava um payload pequeno embutido e outro que ultrapassa o
limite, recupera ambos, verifica tamanho e SHA-256 e retorna os objetos de
resultado legíveis por máquina `small_payload` e `large_payload`.
Um resultado aprovado para o payload grande comprova que o driver produz
um envelope válido `durable-workflow.v2.external-payload-reference.v1` de
ponta a ponta. Trate uma falha de diagnóstico como problema na política de
armazenamento. Não habilite tráfego de workflows por um namespace cuja
política não passe na verificação de ida e volta.

## Escolha de um limite {#picking-a-threshold}

O comportamento padrão mantém os payloads embutidos até atingirem
`threshold_bytes`. Bons pontos de partida:

- Ajuste o limite ao ponto em que payloads embutidos começam a gerar pressão
  operacional, normalmente entre 256 KiB e 2 MiB de bytes codificados.
- Deixe uma margem confortável abaixo do limite estrutural
  [`payload_size_bytes`](../constraints/structural-limits.md#payload-size)
  do namespace, para que o tamanho limitado seja o do envelope de referência,
  e não o dos próprios bytes.
- Defina um único limite por namespace. Escolha com base na atividade ou
  workflow produtor de payloads que gera mais bytes por execução, em vez de
  ajustá-lo para o payload mediano.

Não há benefício em definir um limite muito baixo: a ida e volta de payloads
pequenos pelo banco é mais rápida que pelo armazenamento externo, e o próprio
envelope de referência consome uma pequena quantidade de espaço no histórico.

## Replay, retenção e limpeza {#replay-retention-and-cleanup}

- **Integridade do replay.** Toda busca verifica o objeto armazenado contra
  `size_bytes` e `sha256` da referência. Um blob alterado ou ausente lança
  uma exceção de integridade, sem substituir silenciosamente outro valor.
- **Cache de buscas verificadas.** Workers armazenam bytes verificados em
  cache por `(uri, sha256, size, codec)`, com limites de entradas e bytes.
  Leituras repetidas do histórico da mesma execução evitam buscar novamente
  o mesmo objeto sem enfraquecer a verificação de integridade no primeiro carregamento.
- **Retenção.** Quando a passagem de retenção do servidor remove uma execução
  de workflow, também exclui os objetos de payload externo referenciados por
  seu histórico. Objetos órfãos não se acumulam enquanto a retenção está funcionando.
- **Exportação de histórico.** O histórico exportado preserva o envelope de
  referência. Consumidores posteriores que precisarem dos bytes referenciados
  devem buscá-los pelo mesmo driver e verificá-los contra o envelope antes de
  decodificar. O formato de exportação não embute bytes externos.

## Uso pelo código {#using-it-from-code}

A maioria das aplicações nunca chama a API de armazenamento diretamente:
o runtime transfere os dados de forma transparente conforme a política do
namespace, e o SDK decodifica as referências no replay. Aplicações que precisam
construir ou consumir envelopes fora do runtime, como um handler de ponte
independente de linguagem ou um teste que sintetiza um payload grande, usam
os helpers dos SDKs.

- **PHP (pacote de workflow).** O helper
  `Workflow\V2\Support\ExternalPayloadStorage` armazena e busca bytes por
  qualquer driver que implemente
  `Workflow\V2\Contracts\ExternalPayloadStorageDriver`.
  `LocalFilesystemExternalPayloadStorage` trata URIs `file://`, e o servidor
  independente inclui um driver de disco de sistema de arquivos que dá
  suporte aos drivers de política `s3`, `gcs` e `azure` por um disco Laravel nomeado.
- **SDK Python.** Consulte
  [Armazenamento externo de payloads](../polyglot/python.md#external-payload-storage)
  para conhecer `ExternalPayloadReference`, `ExternalPayloadCache`,
  `store_external_payload()`, `fetch_external_payload()` e os adaptadores
  `LocalFilesystemExternalStorage`, `S3ExternalStorage`, `GCSExternalStorage`
  e `AzureBlobExternalStorage`. Os clientes dos SDKs de nuvem continuam sob
  responsabilidade da aplicação. O SDK não adiciona boto3, google-cloud-storage
  nem azure-storage-blob como dependências de runtime.
- **HTTP direto.** Chamadores HTTP que codificam payloads manualmente podem
  armazenar bytes pelo driver e depois enviar o envelope de referência como
  campo de payload na requisição. O envelope de payload do protocolo de
  workers (`{codec, blob}`) continua transportando referências para argumentos
  e resultados de atividades, payloads de sinais e payloads de atualizações.

## Consulte também {#see-also}

- [Passagem de dados](../defining-workflows/passing-data.md) para o contrato
  padrão de payload embutido.
- [Limites estruturais: tamanho do payload](../constraints/structural-limits.md#payload-size)
  para o teto imposto pelo mecanismo, que o armazenamento externo permite respeitar.
- [Referência da API do Server: namespace e armazenamento](../polyglot/server-api-reference.md#namespace-and-storage)
  para o contrato HTTP completo, incluindo os campos do envelope de referência.
- [Referência da CLI: comandos de namespace e atributos de busca](../polyglot/cli-reference.md#namespace-and-search-attribute-commands)
  para o uso de `dw namespace:set-storage-driver` e `dw storage:test`.
- [SDK Python: armazenamento externo de payloads](../polyglot/python.md#external-payload-storage)
  para drivers, helpers e orientações de cache de replay no Python.
