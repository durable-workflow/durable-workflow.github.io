---
title: "Mover cargas entre runtimes"
description: "Drene execuções existentes e mova novos inícios entre Server próprios e Cloud."
tags:
  - migration
  - operations
  - polyglot
---

# Mover cargas entre runtimes

Direcione novos inícios ao destino enquanto as execuções existentes terminam na origem. Este procedimento cobre runtimes independentes em modo serviço. Exportar o histórico preserva evidências, mas não transfere uma execução ativa originada no Server. A [importação de embedded v2](./embedded-to-server.md#phase-e-import-eligible-embedded-v2-runs) aceita apenas origens embedded elegíveis.

## Escolha o destino {#paths}

| Mudança | Preparação do destino |
| --- | --- |
| Server próprio para outro Server próprio | Implante o destino com seu próprio banco autoritativo, armazenamento de payloads e credenciais. Siga o [guia de implantação](../deployment.md). |
| Server próprio para Cloud | Provisione o namespace de destino e verifique a URL do runtime, as credenciais e as capacidades retornadas. Siga a [configuração do Cloud](./cloud-control-plane.md). |
| Cloud para Server próprio | Prepare o destino próprio e seus workers SDK antes de alterar o tráfego da aplicação. Mantenha a origem Cloud provisionada enquanto suas execuções drenam. |

## Prepare os dois runtimes {#prepare}

Registre cada endpoint de origem, namespace, ID da instância e da execução, fila de tarefas, tipos de workflow/activity e dependências do armazenamento de payloads. Preserve um caminho de recuperação testado para o armazenamento próprio. Sair do Cloud não concede acesso a backup do banco nem copia credenciais Cloud ao destino. Verifique a versão e as capacidades reais do destino, credenciais por papel, registros de workers e tipos anunciados.

## Mude novos inícios em grupos pequenos {#cutover}

1. Execute o destino e seus workers ao lado da origem. Conclua um canário com identidade única, atividades representativas e resultados. Isole seus efeitos do trabalho real do negócio.
2. Inventarie todos os produtores de inícios: chamadas da aplicação, agendamentos, adaptadores webhook/bridge e chamadas de serviço. Escolha um ponto de corte para uma família de workflows. Coordene pausas de agendamentos e registro no destino para que os dois runtimes não iniciem a mesma ocorrência.
3. Direcione os novos inícios dessa família ao destino. Mantenha na aplicação um registro do endpoint e namespace que aceitaram cada workflow. Reutilizar uma chave de negócio em outro runtime não fornece deduplicação entre runtimes.
4. Mantenha sinais, aprovações, atualizações, consultas, cancelamento e leitura de resultados/histórico no runtime que possui a execução. Preserve workers, filas, timers, credenciais e acesso aos payloads da origem. Alterar a URL do cliente não move trabalho aceito nem suas leases de atividade.
5. Verifique resultados e falhas antes de mover a próxima família. Se o resultado de um início for incerto por causa do transporte, esclareça-o no runtime original antes de enviá-lo a outro. Uma execução longa que nunca chega ao estado terminal não foi drenada.

## Preserve evidências antes da retirada {#preserve-evidence}

Exporte o histórico que precisa reter, incluindo cada execução de continuação necessária, bytes originais dos payloads e codecs. Verifique integridade e completude com um consumidor compatível e retenha a identidade exata do produtor. O [guia de exportação e replay](../testing.md#service-sdk-replay) explica as verificações separadas. Exportações de auditoria não tornam execuções do Server elegíveis à importação de estado ativo.

Use o produtor que realmente fornece a exportação. Core 2.11.4 sozinho não qualifica exportações do Server, CLI incluída, SDK HTTP ou Cloud. Acompanhe a [qualificação separada do produtor HTTP e da imagem do Server](https://github.com/durable-workflow/server/issues/692). Pacotes antigos com perdas continuam inválidos. Não altere números ou checksums para forçar aceitação nem destrua a origem autoritativa enquanto as evidências necessárias estiverem indisponíveis ou não verificáveis.

## Retire a origem por último {#retire-source}

Confirme que não restam execuções não terminais da origem em todos os namespaces relevantes e em todas as páginas de listagem. Inclua pais/filhos em espera e execuções criadas por produtores restantes. Um endpoint saudável, uma primeira página vazia ou métricas indisponíveis não comprovam ausência de trabalho aberto. Confirme que nenhum chamador, callback ou worker depende da origem e que os arquivos necessários podem ser lidos.

Só então retire recursos próprios ou desprovisione o runtime Cloud. As cobranças de capacidade Cloud continuam enquanto ele estiver provisionado, inclusive ocioso ou drenando. Desprovisionar remove dados ativos e credenciais e não é pausar/retomar. Use os termos retornados pelo plano vigente; este procedimento não cria reembolso automático nem exceção de cobrança.

## Reverta o roteamento sem mover execuções {#rollback}

Direcione inícios futuros de volta apenas a uma origem saudável e compatível. Execuções já aceitas pelo destino continuam pertencendo a ele e precisam de seus workers e do roteamento de comandos até terminarem. Preserve os dois registros de propriedade e evite inícios duplicados. Não restaure armazenamento antigo sobre estado aceito mais recente nem retome uma segunda cópia ativa da execução.
