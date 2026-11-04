---
title: Compatibilidade de bancos de dados
---

# Compatibilidade e qualificação de bancos de dados

Use esta tabela para escolher o banco do Laravel embutido e do Server autogerenciado. Cloud gerencia a persistência do runtime. Clientes Cloud configuram clientes SDK e workers, não um banco do runtime.

Uma base de compatibilidade declarada não prova que toda versão posterior foi qualificada. Testes de código e artefatos publicados instalados são evidências diferentes. Este retrato vincula o código Workflow 2.20.3 e os recibos Server 3.0.5. Não muda a compatibilidade nem estabelece uma faixa mínima/máxima testada.

| Motor | Compatibilidade declarada | Qualificação de código observada | Qualificação do artefato publicado |
| --- | --- | --- | --- |
| MySQL | Embutido: base 8.0. Server: base 8.0. | Core: 26.10.0 nos jobs originais com imagem flutuante. Perfis Server: 8.0.46 e 8.4.5. | A observação Core vincula o código publicado. Compose do Server 3.0.5 usa `mysql:8.0` para smoke de esquema/saúde, não qualificação completa de execução/capacidade/TLS. |
| PostgreSQL | Embutido: base 13. Server: base 13. | Core: 18.6. Perfis Server: 16.15 e 17.11. | A observação Core vincula o código publicado. Não foi encontrado recibo de endpoint PostgreSQL vinculado ao índice Server 3.0.5 no inventário inspecionado. |
| MariaDB | Embutido: base 10.5. Server aceita `mariadb`; nenhuma versão base é estabelecida aqui. | Core: 10.5.29. Perfil Server: 10.11.19. | A observação Core vincula o código publicado. Não foi encontrado recibo de endpoint MariaDB vinculado ao índice Server 3.0.5 no inventário inspecionado. |
| SQLite | Capacidades/testes embutidos incluem SQLite. Server declara base 3.35. | Os jobs originais de código Core não emitiram a versão da biblioteca SQLite. | A aceitação do Core 2.20.3 instalado exercitou SQLite sem estabelecer faixa de versões. O corpus do candidato Server 3.1.0 congelado é separado do estável 3.0.5. |
| SQL Server | Core embutido publicado anuncia `sqlsrv`, mas continua sem qualificação. A qualificação Server não é estabelecida aqui. | Nenhum job SQL Server recuperado na matriz Core publicada. O guard proposto do backend é trabalho de código separado. | Nenhuma qualificação publicada correspondente recuperada. Não deduza suporte pelo anúncio da capacidade embutida. |

## Como interpretar a evidência {#reading-the-evidence}

O [inventário Core](https://github.com/durable-workflow/durable-workflow.github.io/issues/347#issuecomment-6642279325) vincula digests originais e quatro jobs MySQL, quatro PostgreSQL e um MariaDB no código publicado. As doze células de upgrade publicado cobrem combinações Laravel/PHP, não doze endpoints de banco. O [recibo do Core instalado normalmente](https://github.com/durable-workflow/workflow/pull/1025#issuecomment-6632522927) cobre separadamente 67 casos stream/replay/fake com SQLite. Nem versão PHP nem seletor flutuante fornecem uma versão de banco não emitida.

O [inventário Server](https://github.com/durable-workflow/server/issues/563#issuecomment-6642659277) separa os escopos dos jobs de código nativo e PHP anterior. O [recibo estável 3.0.5](https://github.com/durable-workflow/server/issues/563#issuecomment-6643169603) tem quatro células smoke Compose de arquitetura/perfil. `local` e `production` usam MySQL. Os logs inspecionados não recuperam versão/digest exatos do banco acompanhante, qualificação de escrita ou TLS verificado. Perfis de código e candidato congelado não qualificam outra imagem publicada.

## Ciclo do fornecedor e motores distribuídos {#vendor-lifecycle-and-distributed-engines}

Para novas instalações, prefira linhas mantidas pelo fornecedor após qualificar o par exato runtime/banco. A [política PostgreSQL](https://www.postgresql.org/support/versioning/) marca 13 sem suporte e encerra 14 em 12 de novembro de 2026. O [aviso Oracle](https://www.mysql.com/support/eol-notice.html) coloca MySQL 8.0 em Sustaining Support desde 21 de abril de 2026. O ciclo do fornecedor não estabelece nem remove nossa qualificação de artefatos.

TiDB, Vitess, PlanetScale e outras instalações distribuídas compatíveis com MySQL não foram testadas aqui. Compatibilidade de protocolo não prova isolamento transacional, bloqueios de linha, visibilidade commit/after-commit ou comportamento de repetição. Valide essa semântica com o runtime exato antes de adotar. Esta tabela não amplia o [envelope operacional de região única](../operator-operating-envelope.md) para várias regiões.
