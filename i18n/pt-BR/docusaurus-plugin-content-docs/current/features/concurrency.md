---
sidebar_position: 10
---

import ConcurrencySimulator from '@site/src/components/ConcurrencySimulator';

# Concorrência {#concurrency}

Este guia aborda concorrência em workflows Laravel embarcados que usam
`Workflow\V2\Workflow`. Para workers no modo de serviço, use o
[guia do SDK PHP](https://php.durable-workflow.com/build/workflows-activities/), o
[guia do SDK Python](https://python.durable-workflow.com/sdk-reference/#deterministic-parallel-groups) ou a
[referência do SDK Rust](https://rust.durable-workflow.com/durable_workflow/struct.WorkflowContext.html#method.parallel).

`all([...])` descreve o grupo durável completo antes da suspensão. O runtime
embarcado agenda os comandos de atividades e workflows filhos e retorna os
resultados com a estrutura aninhada original da entrada.

Use um grupo de seleção quando o progresso depender do primeiro membro
concluído, em vez da barreira inteira. A seleção também é durável: inicia
todos os membros, registra um vencedor e deixa os demais executando até que
o código do workflow os aguarde ou cancele explicitamente.

## Em série {#series}

Este exemplo executa 3 atividades em série, esperando cada uma concluir antes de continuar para a próxima.

```php
use function Workflow\V2\activity;
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return [
            activity(MyActivity1::class),
            activity(MyActivity2::class),
            activity(MyActivity3::class),
        ];
    }
}
```

<ConcurrencySimulator 
  activities={[
    { name: 'MyActivity1', duration: 1500 },
    { name: 'MyActivity2', duration: 2000 },
    { name: 'MyActivity3', duration: 1200 },
  ]}
  mode="series"
  title="Simulador de execução em série"
/>

## Em paralelo {#parallel}

Este exemplo executa 3 atividades em paralelo, esperando todas concluírem e coletando os resultados.

```php
use function Workflow\V2\{all, activity};
use Workflow\V2\Workflow;

class MyWorkflow extends Workflow
{
    public function handle()
    {
        return all([
            fn () => activity(MyActivity1::class),
            fn () => activity(MyActivity2::class),
            fn () => activity(MyActivity3::class),
        ]);
    }
}
```

<ConcurrencySimulator 
  activities={[
    { name: 'MyActivity1', duration: 2000 },
    { name: 'MyActivity2', duration: 1500 },
    { name: 'MyActivity3', duration: 2500 },
  ]}
  mode="parallel"
  title="Simulador de execução em paralelo"
/>

A principal diferença entre os exemplos em série e em paralelo é onde a suspensão ocorre. No exemplo em série, cada chamada `activity()` suspende e retoma o workflow diretamente. No exemplo em paralelo, as closures primeiro descrevem a barreira inteira, e `all()` suspende uma única vez para todo o grupo. Assim, todos os membros podem executar em paralelo antes da retomada do workflow.

## Seleção pela primeira conclusão {#first-completion-selection}

`select([...])` inicia atividades independentes, workflows filhos,
temporizadores, esperas por sinais, esperas por condição ou barreiras comuns
aninhadas, e retoma quando um membro confirma um resultado elegível ou uma
falha tipada. Dê aos membros chaves estáveis da aplicação quando o código
posterior precisar distingui-los ou acessá-los novamente.
As chaves devem ser strings não vazias ou inteiros não negativos.

O coordenador a seguir inicia seu prazo na mesma etapa durável que o resolvedor.
O processamento de entradas e o progresso do resolvedor não podem reiniciar
nem adiar esse prazo:

```php
use function Workflow\V2\{activity, await, select, timer};
use Workflow\V2\Workflow;

final class ResolveInRealTime extends Workflow
{
    public function handle(string $requestId): array
    {
        $selected = select([
            'resolved' => fn () => activity(ResolveRequest::class, $requestId),
            'manual' => fn () => await('resolution.received'),
            'deadline' => fn () => timer('2 seconds'),
        ]);

        if ($selected->key === 'deadline') {
            $selected->handles['resolved']->cancel();

            return ['status' => 'timed_out'];
        }

        // The deadline is not cancelled just because another member won.
        $selected->handles['deadline']->cancel();

        return [
            'status' => 'resolved',
            'source' => $selected->key,
            'value' => $selected->result(),
        ];
    }
}
```

O resultado contém a chave e o índice estáveis do membro, o tipo da operação
e sua identidade durável, o resultado ou falha tipada, o handle do vencedor e
um handle para cada membro. Um handle que não venceu pode ser aguardado depois
com `await()` ou cancelado com `cancel()`. A seleção nunca descarta nem cancela
implicitamente outro membro. `cancel()` é uma solicitação void/unit e nunca
informa se o cancelamento venceu. O histórico `SelectionOperationCancelled`
é a fonte de verdade do resultado. Se a conclusão for confirmada primeiro,
o runtime não grava marcador de cancelamento. O replay só avança além da
chamada de cancelamento após um limite confirmado de tarefa de workflow,
um comando sucessor ou um evento terminal do workflow comprovar que a operação
sem efeito foi confirmada. O replay para consulta para em um cancelamento em
andamento, sem expor estado especulativo posterior. Aguardar o handle após a
confirmação da operação sem efeito retorna a conclusão anterior.

O runtime registra a primeira resolução elegível mantendo o bloqueio de
confirmação da execução pai. Assim, reinicialização a frio, recarga do histórico
persistido, replay para consulta e conclusões posteriores de membros perdedores
reutilizam o vencedor registrado, em vez de disputar futures locais da linguagem
ou reinterpretar a ordem do histórico. Entregas exatamente duplicadas são
idempotentes. Entradas concorrentes são ordenadas pelo histórico durável
confirmado. Uma entrada que chega enquanto uma atividade executa fica visível
na próxima tarefa de workflow, e uma entrada tardia ou duplicada não pode
substituir um vencedor já registrado.

## Barreiras aninhadas {#nested-barriers}

Grupos `all([...])` aninhados permitem que uma etapa de workflow expresse uma árvore durável de ramificação e convergência de trabalho. O runtime agenda cada atividade ou workflow filho como uma sequência durável de folha, registra o `parallel_group_path` completo da folha, espera até que cada barreira envolvente possa avançar e então reconstrói o formato aninhado original dos resultados antes de retomar o corpo do workflow. Durante o replay, uma folha de atividade ou de filho de uma etapa `all([...])` ainda deve corresponder ao caminho de grupo registrado. Histórico tipado de folha sem metadados de grupo é tratado como histórico incompatível de uma prévia antiga, sem tentar adivinhar sua posição na barreira atual.

```php
use function Workflow\V2\{all, activity};
use Workflow\V2\Workflow;

final class NestedWorkflow extends Workflow
{
    public function handle(): array
    {
        return all([
            fn () => activity(BuildSummary::class),
            fn () => all([
                fn () => activity(BuildInvoice::class),
                fn () => activity(BuildShipment::class),
            ]),
        ]);
    }
}
```

Nesse exemplo, o Waterline expõe três esperas abertas de folhas, em vez de uma espera “aninhada” sintética. A primeira folha pertence apenas à barreira externa, enquanto a segunda e a terceira expõem um `parallel_group_path` com duas entradas, para que operadores vejam tanto o grupo externo quanto o subgrupo interno ainda aberto.

O tamanho do grupo externo conta folhas duráveis, não arrays aninhados.
Cada folha aninhada contém um `parallel_group_path` do grupo externo ao
interno; cada entrada do caminho preserva a mesma posição durável do workflow.
O grupo agenda todas as folhas antes de suspender e então monta os valores
bem-sucedidos pela posição de entrada. A reinicialização do worker e o replay
do histórico concluído reconstroem a mesma identidade de grupo. Entregas
terminais exatamente duplicadas são ignoradas, e uma conclusão tardia de outro
membro pode enriquecer diagnósticos parciais sem mudar o membro com falha já
selecionado pela política determinística do runtime embarcado.

O runtime embarcado lança a falha tipada da folha a partir de `all()` e mantém
os metadados duráveis do grupo da barreira no histórico e nas telas do operador.

## Callback assíncrono {#async-callback}

`async(...)` executa um callback serializável como um workflow filho durável com o tipo de sistema `durable-workflow.async`. Callbacks assíncronos usam o mesmo contrato de helpers exclusivamente sequenciais dos workflows v2 nomeados. Assim, `activity()`, `await()`, `timer()`, `sideEffect()` e outros helpers de etapa única suspendem diretamente dentro do corpo do callback sem exigir `yield`.

```php
use function Workflow\V2\{activity, async};
use Workflow\V2\Workflow;

final class CustomerWorkflow extends Workflow
{
    public function handle(string $customerId): array
    {
        $profile = async(static function () use ($customerId): array {
            $customer = activity(LoadCustomer::class, $customerId);

            return [
                'customer' => $customer,
                'score' => activity(ScoreCustomer::class, $customer['id']),
            ];
        });

        return ['profile' => $profile];
    }
}
```

A execução pai vê o callback como uma espera por filho, por isso histórico de comandos, linhagem e detalhes no Waterline usam o mesmo `child_call_id`, ID da execução filha e histórico de resultado de uma chamada explícita a `child(...)`. O callback é serializado com o suporte do Laravel a closures serializáveis, portanto mantenha-o local à aplicação e à implantação. Use uma chamada nomeada `child(SomeWorkflow::class, ...)` quando o trabalho precisar de um tipo público estável de workflow para roteamento entre serviços ou evolução de código de longa duração. Callbacks `async(...)` agora são exclusivamente sequenciais na v2, portanto chame helpers como `activity()`, `child()`, `await()`, `timer()` e `all([...])` diretamente, sem `yield`.

## Barreiras mistas de atividades e filhos {#mixed-activity--child-barriers}

O mesmo helper `all()` também pode reunir um grupo misto de atividades e workflows filhos. Os resultados continuam retornando na ordem original do array, membros bem-sucedidos continuam esperando o restante do grupo e o primeiro membro com falha ainda desperta o pai imediatamente.

Quando mais de um membro da barreira já encerrou sem sucesso no momento do replay do pai, o pai recebe a falha com o horário de encerramento registrado mais antigo. Se duas falhas tiverem o mesmo horário registrado, vence o menor índice de folha da barreira, para que a retomada do workflow e o replay para consulta selecionem a mesma exceção. Falhas posteriores de outros membros não substituem a exceção já lançada na etapa do pai.

```php
use function Workflow\V2\{all, activity, child};
use Workflow\V2\Workflow;

final class OrderWorkflow extends Workflow
{
    public function handle(): array
    {
        [$charge, $shipment] = all([
            fn () => activity(ChargeCustomer::class),
            fn () => child(ShipOrderWorkflow::class),
        ]);

        return compact('charge', 'shipment');
    }
}
```

## Limites atuais {#current-limits}

A interface atual de concorrência ainda não inclui:

- helpers integrados de concorrência limitada além de grupos `all([...])` explicitamente aninhados

## Workflows filhos em paralelo {#child-workflows-in-parallel}

Workflows filhos também podem executar em sua própria barreira `all([...])`. O funcionamento é igual à execução paralela de atividades, mas para workflows filhos: o pai inicia várias execuções filhas de forma durável e só retoma quando a barreira inteira de filhos pode avançar.

```php
use function Workflow\V2\{all, child};
use Workflow\V2\Workflow;

final class ParentWorkflow extends Workflow
{
    public function handle(): array
    {
        return all([
            fn () => child(MyChild1::class),
            fn () => child(MyChild2::class),
            fn () => child(MyChild3::class),
        ]);
    }
}
```

<ConcurrencySimulator 
  activities={[
    { name: 'MyChild1', duration: 2200 },
    { name: 'MyChild2', duration: 1800 },
    { name: 'MyChild3', duration: 2500 },
  ]}
  mode="parallel"
  title="Simulador de workflows filhos em paralelo"
/>

Isso facilita criar paralelismo hierárquico nos workflows, incluindo grupos aninhados apenas de filhos ou mistos de filhos e atividades quando uma etapa do pai precisa de mais de uma camada de convergência.
