---
title: Protocolo Avro Value
sidebar_label: Protocolo Avro Value
---

# Protocolo Avro Value {#avro-value-protocol}

O Durable Workflow 2.0 usa um único schema recursivo fixo
[`durable_workflow.protocol.Value`](/schemas/v2/durable_workflow.protocol.Value.v1.avsc)
para todos os payloads Avro. Entradas e resultados de workflows, valores de
atividades e detalhes de falhas, sinais, consultas, atualizações, histórico de
replay e payloads armazenados externamente usam o mesmo schema. As aplicações
não publicam seus próprios schemas Avro, e a plataforma não exige um registro
de schemas na rede.

A união de valores tem variantes nomeadas distintas para nulo, booleano, inteiro
de 64 bits com sinal, double finito, bytes, string UTF-8, lista e mapa com chaves
string. Isso mantém `7` distinto de `7.0`, texto distinto de bytes e listas
distintas de mapas em PHP, Python e Rust.

## Frame de transmissão {#wire-frame}

O campo `blob` contém em base64 os bytes padrão de objeto único Avro:

```text
C3 01 || 8-byte little-endian CRC-64-AVRO fingerprint || Avro datum
```

O schema v1 tem o fingerprint `e2a33dff55802237`. Os SDKs incluem o schema
imutável para cada fingerprint compatível, selecionam o schema do escritor a
partir do frame e o resolvem em relação ao leitor atual. Um fingerprint
desconhecido ou uma nova variante incompatível falha com
`unsupported_payload_schema`; os decodificadores não fazem suposições nem
recorrem a JSON.

Tipos de valor futuros são novas variantes de registro com nomes únicos,
acrescentadas à união. Variantes já publicadas nunca são reordenadas nem
reutilizadas.

## Política de valores {#value-policy}

- As chaves dos mapas devem ser strings. Os SDKs rejeitam outras chaves em vez
  de convertê-las em strings.
- Inteiros devem caber no intervalo de `long` Avro de 64 bits com sinal.
- Doubles devem ser finitos; NaN e infinitos são rejeitados.
- `bytes` do Python e `AvroValue::Bytes` do Rust selecionam `bytes` Avro. Em PHP,
  use `AvroBinaryValue::fromBytes()`, pois uma string PHP sozinha não informa
  se representa texto ou conteúdo binário.
- Decimal, inteiro de precisão arbitrária, data/hora, UUID, enum, dataclass,
  Pydantic e objetos de domínio exigem adaptadores explícitos para um tipo de
  valor canônico.

Avro é o único codec de payload do Durable Workflow 2.0. Os documentos de
requisição e resposta HTTP continuam usando transporte JSON, mas cada valor
durável nesses documentos usa este schema fixo e o frame de objeto único. Uma
tag de codec `json`, um codec desconhecido ou um blob durável bruto sem tag é
rejeitado com `unsupported_payload_codec`; os runtimes nunca transcodificam
nem tentam adivinhar.

## Projeção JSON para inspeção {#json-inspection-projection}

As descrições das execuções mantêm `input_envelope`, `output_envelope` e os
envelopes de resultados como fonte de autoridade sem perdas do payload. As
interfaces de inspeção baseadas em JSON, como a CLI e o Waterline, exibem os
valores que JSON não consegue representar por meio de uma projeção tipada:

```json
{"$type":"bytes","base64":"AP8="}
{"$type":"map","entries":[{"key":"0","value":"zero"}]}
```

A projeção de mapa é usada para mapas vazios e chaves string com aparência
numérica que os arrays PHP não conseguem preservar sem alterar seu tipo.
Escalares comuns, listas e mapas com chaves string inequívocas continuam sendo
valores JSON comuns. Consumidores que precisam do valor tipado original
decodificam o envelope correspondente em vez da projeção de exibição.

## Benchmark reproduzível {#repeatable-benchmark}

Cada SDK inclui o mesmo benchmark de valores representativos e aplica um
orçamento ao caminho selecionado para produção:

```bash
# PHP SDK checkout
composer benchmark-avro-value

# Python SDK checkout
python benchmarks/avro_value.py --enforce

# Rust SDK checkout
cargo run --release --example avro_value_benchmark -- --enforce
```

A saída JSON compara JSON compacto, o wrapper JSON-em-Avro removido e o schema
tipado fixo. Ela informa os tamanhos do datum bruto, do payload com frame e do
envelope HTTP real `{codec, blob}`, junto com a latência de ponta a ponta do
adaptador, da codificação e da decodificação. `AVRO_VALUE_ENCODE_BUDGET_US` e
`AVRO_VALUE_DECODE_BUDGET_US` podem tornar os padrões mais rigorosos em um
executor de qualificação. A CI de release executa esses comandos com aplicação
do orçamento; uma regressão no caminho de produção deve ser explicada ou
corrigida antes do release. A implementação antiga do wrapper existe somente
no benchmark, não como caminho de compatibilidade em runtime.

## Verificação prévia da implantação {#deployment-preflight}

A inicialização do Server inventaria cada `payload_codec` persistido e verifica
a assinatura de objeto único e o fingerprint do schema fixo de frames inline,
envelopes de histórico aninhados e referências a payloads externos. A
implantação para antes de iniciar o novo runtime se houver qualquer payload
não Avro ativo ou relevante para replay, payload sem tag, referência corrompida
ou frame obsoleto. As execuções ativas podem ser concluídas no pré-release
atual; o estado terminal retido e o estado relevante para replay devem seguir
a [migração de histórico de pré-release](/docs/polyglot/prerelease-history-migration),
começando pelo backup. Exportar uma execução não altera o estado rejeitado no
banco de dados. Nunca exclua o histórico para contornar a verificação prévia.
