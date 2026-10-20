---
sidebar_position: 3
title: Posicionamento e afinidade de workers
description: Escolha roteamento por fila, atividades locais ou sessões de worker sem tratar o nome de uma fila como afinidade com um host físico.
tags:
  - configuration
  - workers
  - affinity
keywords:
  - activity worker affinity
  - dedicated activity queue
  - same process activity
  - worker sessions
---

# Posicionamento e afinidade de workers {#worker-placement-and-affinity}

O nome de uma fila delimita o roteamento, mas não garante afinidade com um host
físico. Definir a propriedade `$queue` em um workflow ou atividade restringe quais
workers podem assumir a tarefa, mas qualquer worker compatível que consulte essa
fila pode recebê-la. Não transfira dados entre atividades comuns pelo sistema de
arquivos local de um worker, a menos que os dados também estejam armazenados em
um local compartilhado e durável.

## Direcione o trabalho para um grupo dedicado de workers {#route-work-to-a-dedicated-worker-pool}

Use uma fila dedicada quando um tipo de trabalho exigir um grupo específico de
workers, como workers com um volume compartilhado montado ou capacidade de GPU:

```php
use Workflow\V2\Activity;

final class RenderVideo extends Activity
{
    public ?string $queue = 'gpu-activities';
}
```

Inicie nessa fila apenas os workers Laravel desejados:

```bash
php artisan queue:work --queue=gpu-activities
```

O Laravel Horizon pode supervisionar a mesma fila. Em ambos os casos, a garantia
é de "um dos workers atribuídos a esta fila", e não de "o mesmo processo ou host
que executou a etapa anterior". Coloque os dados transferidos em payloads duráveis
do workflow, no armazenamento externo de payloads ou em outro armazenamento
compartilhado disponível para todos os workers elegíveis.

## Escolha o contrato de afinidade necessário {#choose-the-affinity-contract-you-need}

- Use uma [atividade comum em fila](/docs/defining-workflows/activities)
  quando o trabalho puder ser executado por qualquer worker compatível da fila.
- Use uma [atividade local](/docs/features/local-activities) quando uma atividade
  curta, que aceite novas tentativas, precisar ser executada dentro do processo
  do worker de workflow que está processando a tarefa do workflow.
- Use uma [sessão de worker](/docs/features/worker-sessions) quando várias etapas
  de atividades duráveis precisarem reutilizar uma concessão de sessão de worker
  para estado local ao processo, memória de GPU ou um sistema de arquivos montado
  localmente no worker.

As sessões de worker continuam aplicando primeiro o roteamento por fila. Elas
acrescentam um contrato explícito de concessão e capacidade após o roteamento,
incluindo expiração e reaquisição opcional. Isso não torna uma máquina individual
imortal. Se o estado precisar sobreviver à perda do worker ou à reaquisição da
sessão, mantenha-o em armazenamento compartilhado e durável.

Consulte [Modelo de execução de atividades](/docs/features/activity-execution-model)
para comparar as opções de posicionamento e [Opções](/docs/configuration/options#queue)
para configurar filas no nível da classe e por chamada.
