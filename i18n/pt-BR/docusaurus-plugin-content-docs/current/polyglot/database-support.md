---
title: Compatibilidade de bancos de dados
---

# Compatibilidade e qualificação de bancos de dados

Use esta tabela para escolher o banco do Laravel embutido e do Server autogerenciado. Cloud gerencia a persistência do runtime. Clientes Cloud configuram clientes SDK e workers, não um banco do runtime.

Uma base de compatibilidade declarada não prova que toda versão posterior foi qualificada. Testes de código e artefatos publicados instalados são evidências diferentes. Este retrato vincula o código Workflow 2.20.3 e os recibos de release Server 3.3.2. Não muda a compatibilidade nem estabelece uma faixa mínima/máxima testada.

| Motor | Compatibilidade declarada | Qualificação de código observada | Qualificação do artefato publicado |
| --- | --- | --- | --- |
| MySQL | Embutido: base 8.0. Server: base 8.0. | Core: 26.10.0 nos jobs originais com imagem flutuante. Perfis Server: 8.0.46 e 8.4.5. | A observação Core vincula o código publicado. O smoke de release e o smoke Compose de índice exato do Server 3.3.2 usam MySQL 8.0 fixado por digest para verificações de inicialização/saúde, não qualificação completa de execução/capacidade/TLS. |
| PostgreSQL | Embutido: base 13. Server: base 13. | Core: 18.6. Perfis Server: 16.15 e 17.11. | A observação Core vincula o código publicado. O smoke de release do Server 3.3.2 inicia a frio a imagem de cada arquitetura sobre PostgreSQL 17 fixado por digest apenas para prontidão e informações do cluster, não qualificação completa de execução/capacidade/TLS. |
| MariaDB | Embutido: base 10.5. Server aceita `mariadb`; nenhuma versão base é estabelecida aqui. | Core: 10.5.29. Perfil Server: 10.11.19. | A observação Core vincula o código publicado. Não foi encontrado recibo de endpoint MariaDB vinculado ao índice Server 3.3.2 na evidência de release inspecionada. |
| SQLite | Capacidades/testes embutidos incluem SQLite. Server declara base 3.35. | Os jobs originais de código Core não emitiram a versão da biblioteca SQLite. | A aceitação do Core 2.20.3 instalado exercitou SQLite sem estabelecer faixa de versões. O smoke de release do Server 3.3.2 inicia a frio sobre SQLite, também sem faixa de versões da biblioteca. |
| SQL Server | Core embutido publicado anuncia `sqlsrv`, mas continua sem qualificação. A qualificação Server não é estabelecida aqui. | Nenhum job SQL Server recuperado na matriz Core publicada. O guard proposto do backend é trabalho de código separado. | Nenhuma qualificação publicada correspondente recuperada. Não deduza suporte pelo anúncio da capacidade embutida. |

## Como interpretar a evidência {#reading-the-evidence}

O [inventário Core](https://github.com/durable-workflow/durable-workflow.github.io/issues/347#issuecomment-6642279325) vincula digests originais e quatro jobs MySQL, quatro PostgreSQL e um MariaDB no código publicado. As doze células de upgrade publicado cobrem combinações Laravel/PHP, não doze endpoints de banco. O [recibo do Core instalado normalmente](https://github.com/durable-workflow/workflow/pull/1025#issuecomment-6632522927) cobre separadamente 67 casos stream/replay/fake com SQLite. Nem versão PHP nem seletor flutuante fornecem uma versão de banco não emitida.

O [inventário Server](https://github.com/durable-workflow/server/issues/563#issuecomment-6642659277) separa os escopos dos jobs de código nativo e PHP anterior. Para o Server 3.3.2, a [execução da release](https://github.com/durable-workflow/server/actions/runs/42591612884) inicia a frio as imagens amd64 e arm64 sobre SQLite, PostgreSQL 17 e MySQL 8.0, verifica `/api/ready` e as informações autenticadas do cluster e encerra cada uma com SIGTERM. O [smoke Compose de índice exato](https://github.com/durable-workflow/server/actions/runs/42602031026) tem quatro células de arquitetura/perfil contra o índice `sha256:4aeceb42…`. `local` e `production` usam MySQL, com `mysql:8.0` fixado por digest. O [registro de entrega da 3.3.2](https://github.com/durable-workflow/server/issues/325#issuecomment-6739628227) aceita ambos. Essas execuções iniciam bancos vazios. Não atualizam um banco existente, não qualificam capacidade de escrita nem verificam TLS, e seus logs não informam a versão patch exata do motor. O [recibo estável 3.0.5](https://github.com/durable-workflow/server/issues/563#issuecomment-6643169603) anterior tinha o mesmo formato Compose com um `mysql:8.0` flutuante. Perfis de código não qualificam outra imagem publicada.

## Ciclo do fornecedor e motores distribuídos {#vendor-lifecycle-and-distributed-engines}

Para novas instalações, prefira linhas mantidas pelo fornecedor após qualificar o par exato runtime/banco. A [política PostgreSQL](https://www.postgresql.org/support/versioning/) marca 13 sem suporte e encerra 14 em 12 de novembro de 2026. O [aviso Oracle](https://www.mysql.com/support/eol-notice.html) coloca MySQL 8.0 em Sustaining Support desde 21 de abril de 2026. O ciclo do fornecedor não estabelece nem remove nossa qualificação de artefatos.

TiDB, Vitess, PlanetScale e outras instalações distribuídas compatíveis com MySQL não foram testadas aqui. Compatibilidade de protocolo não prova isolamento transacional, bloqueios de linha, visibilidade commit/after-commit ou comportamento de repetição. Valide essa semântica com o runtime exato antes de adotar. Esta tabela não amplia o [envelope operacional de região única](../operator-operating-envelope.md) para várias regiões.
