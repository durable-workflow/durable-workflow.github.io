---
title: Protocole Avro Value
sidebar_label: Protocole Avro Value
---

# Protocole Avro Value {#avro-value-protocol}

Durable Workflow 2.0 utilise un unique schéma récursif fixe
[`durable_workflow.protocol.Value`](/schemas/v2/durable_workflow.protocol.Value.v1.avsc)
pour toutes les charges utiles Avro. Les entrées et résultats des workflows, les
valeurs des activités et détails d'échec, les signaux, requêtes de lecture,
mises à jour, historiques de relecture et charges utiles stockées en externe
utilisent tous ce même schéma. Les applications ne publient pas leurs propres
schémas Avro et la plateforme ne nécessite aucun registre de schémas réseau.

L'union des valeurs possède des branches nommées distinctes pour null, les
booléens, les entiers signés sur 64 bits, les doubles finis, les octets, les
chaînes UTF-8, les listes et les tables à clés de type chaîne. Ainsi, `7` reste
distinct de `7.0`, le texte des octets et les listes des tables en PHP, Python et Rust.

## Trame de transport {#wire-frame}

Le champ `blob` contient les octets Avro single-object standard encodés en base64 :

```text
C3 01 || 8-byte little-endian CRC-64-AVRO fingerprint || Avro datum
```

Le schéma v1 possède l'empreinte `e2a33dff55802237`. Les SDK embarquent le schéma
immuable de chaque empreinte prise en charge, sélectionnent le schéma d'écriture
à partir de la trame et le résolvent avec le lecteur actuel. Une empreinte
inconnue ou une nouvelle branche incompatible entraîne
`unsupported_payload_schema`. Les décodeurs ne font aucune supposition et ne
se rabattent pas sur JSON.

Les futurs types de valeur seront de nouvelles branches d'enregistrement aux
noms uniques, ajoutées à la fin de l'union. Les branches publiées ne sont jamais
réordonnées ni réutilisées.

## Règles applicables aux valeurs {#value-policy}

- Les clés des tables doivent être des chaînes. Les SDK rejettent les autres
  clés au lieu de les convertir en chaînes.
- Les entiers doivent tenir dans la plage signée sur 64 bits du type Avro `long`.
- Les doubles doivent être finis. NaN et les infinis sont rejetés.
- Python `bytes` et Rust `AvroValue::Bytes` sélectionnent Avro `bytes`. Les
  appelants PHP utilisent `AvroBinaryValue::fromBytes()`, car une chaîne PHP
  seule ne peut pas déclarer si elle représente du texte ou du binaire.
- Les décimaux, entiers de précision arbitraire, dates et heures, UUID,
  énumérations, dataclass, objets Pydantic et objets métier nécessitent des
  adaptateurs explicites vers un type de valeur canonique.

Avro est le seul codec de charge utile de Durable Workflow 2.0. Les documents
des requêtes et réponses HTTP conservent JSON comme transport, mais chaque
valeur durable qu'ils contiennent utilise ce schéma fixe et cette trame
single-object. Une étiquette de codec `json`, un codec inconnu ou un blob
durable brut sans étiquette provoque un rejet avec `unsupported_payload_codec`.
Les runtimes ne transcodent jamais et ne font aucune supposition.

## Projection JSON pour l'inspection {#json-inspection-projection}

Les descriptions des exécutions conservent `input_envelope`, `output_envelope`
et les enveloppes des résultats comme référence sans perte pour les charges
utiles. Les interfaces d'inspection JSON, comme la CLI et Waterline, affichent
les valeurs que JSON ne peut pas représenter à l'aide d'une projection typée :

```json
{"$type":"bytes","base64":"AP8="}
{"$type":"map","entries":[{"key":"0","value":"zero"}]}
```

La projection de table s'applique aux tables vides et aux clés chaînes d'allure
numérique que les tableaux PHP ne peuvent pas conserver sans modifier leur
type. Les scalaires ordinaires, listes et tables à clés chaînes non ambiguës
restent des valeurs JSON ordinaires. Les consommateurs ayant besoin de la
valeur typée d'origine décodent l'enveloppe associée plutôt que la projection
d'affichage.

## Benchmark reproductible {#repeatable-benchmark}

Chaque SDK fournit le même benchmark de valeurs représentatives et impose un
budget à son chemin de production retenu :

```bash
# PHP SDK checkout
composer benchmark-avro-value

# Python SDK checkout
python benchmarks/avro_value.py --enforce

# Rust SDK checkout
cargo run --release --example avro_value_benchmark -- --enforce
```

La sortie JSON compare le JSON compact, l'ancien conteneur JSON dans Avro et le
schéma typé fixe. Elle indique les tailles de la donnée brute, de la charge
utile avec sa trame et de l'enveloppe HTTP réelle `{codec, blob}`, ainsi que les
latences de bout en bout de l'adaptation, de l'encodage et du décodage.
`AVRO_VALUE_ENCODE_BUDGET_US` et `AVRO_VALUE_DECODE_BUDGET_US` permettent de
resserrer les valeurs par défaut sur un runner de qualification. La CI de
publication exécute ces commandes en imposant les budgets. Une régression du
chemin de production doit être expliquée ou corrigée avant publication.
L'ancienne implémentation du conteneur n'existe que dans le benchmark, pas
comme chemin de compatibilité du runtime.

## Contrôle préalable au déploiement {#deployment-preflight}

Au démarrage, Server inventorie chaque `payload_codec` persistant et vérifie la
signature single-object et l'empreinte du schéma fixe des trames en ligne, des
enveloppes d'historique imbriquées et des références aux charges utiles
externes. Le déploiement s'arrête avant le lancement du nouveau runtime s'il
existe une charge utile non Avro active ou nécessaire à la relecture, une
charge sans étiquette, une référence corrompue ou une trame obsolète. Les
exécutions actives peuvent se terminer sur la préversion actuelle. L'état
terminal conservé et l'état nécessaire à la relecture doivent suivre la
[migration de l'historique des préversions](/docs/polyglot/prerelease-history-migration),
qui commence par une sauvegarde. Exporter une exécution ne modifie pas l'état
rejeté de la base de données. Ne supprimez jamais l'historique pour contourner
le contrôle préalable.
