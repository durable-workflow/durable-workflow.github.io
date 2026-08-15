---
slug: combining-laravel-workflow-and-state-machines
title: "Laravel Workflow and State Machines with Finite"
description: "Integrate Laravel Workflow with Finite to model a loan process with explicit created, submitted, approved, and denied transitions driven by workflow signals."
authors:
  name: Richard
  title: Core Team
  url: https://github.com/rmcdaniel
  image_url: https://github.com/rmcdaniel.png
tags: [side-effects, random, determinism]
---

Laravel Workflow handles queued, long-running execution, while Finite makes allowed state transitions explicit. This guide combines them in a loan-application workflow where signals move the process through created, submitted, approved, and denied states.

Benefits of Combining Workflow and State Machines
=========================================================

Using the Workflow package and a state machine together provides several advantages:

1.  Flexibility and modularity: Workflow allows developers to break down complex processes into smaller, modular units that are easy to maintain and update.
2.  Explicit control over transitions: State machines provide a clear visualization of workflow states, activities, and transitions, making it easier to understand and maintain.
3.  Robust error handling and retries: Workflow offers built-in support for handling errors and retries, ensuring that workflows are executed reliably and consistently.
4.  Scalability: Workflow supports queuing and parallel execution, allowing workflows to be executed asynchronously on worker servers.
5.  Integration with Laravel’s queue and event systems: This allows for seamless integration with other Laravel features and packages.

Installation Guide
==================

To get started with Workflow and Finite, you will need to install them in your Laravel project:

For Workflow, run the following command:

```bash
composer require laravel-workflow/laravel-workflow
```

For [Finite](https://github.com/yohang/Finite), run the following command:

```bash
composer require yohang/finite
```

Loan Application Workflow Example
=================================

The following code demonstrates how to create a `LoanApplicationWorkflow` using Workflow and Finite:

```php
use Finite\StatefulInterface;  
use Finite\StateMachine\StateMachine;  
use Finite\State\State;  
use Finite\State\StateInterface;  
use function Workflow\await;
use Workflow\Models\StoredWorkflow;  
use Workflow\SignalMethod;  
use Workflow\Workflow;  
  
class LoanApplicationWorkflow extends Workflow implements StatefulInterface  
{  
    private $state;  
    private $stateMachine;  
  
    public function setFiniteState($state)  
    {  
        $this->state = $state;  
    }  
  
    public function getFiniteState()  
    {  
        return $this->state;  
    }  
  
    #[SignalMethod]  
    public function submit()  
    {  
        $this->stateMachine->apply('submit');  
    }  
  
    #[SignalMethod]  
    public function approve()  
    {  
        $this->stateMachine->apply('approve');  
    }  
  
    #[SignalMethod]  
    public function deny()  
    {  
        $this->stateMachine->apply('deny');  
    }  
  
    public function isSubmitted()  
    {  
        return $this->stateMachine->getCurrentState()->getName() === 'submitted';  
    }  
  
    public function isApproved()  
    {  
        return $this->stateMachine->getCurrentState()->getName() === 'approved';  
    }  
  
    public function isDenied()  
    {  
        return $this->stateMachine->getCurrentState()->getName() === 'denied';  
    }  
  
    public function __construct(  
        public StoredWorkflow $storedWorkflow,  
        ...$arguments  
    ) {  
        parent::__construct($storedWorkflow, $arguments);  
  
        $this->stateMachine = new StateMachine();  
  
        $this->stateMachine->addState(new State('created', StateInterface::TYPE\_INITIAL));  
        $this->stateMachine->addState('submitted');  
        $this->stateMachine->addState(new State('approved', StateInterface::TYPE\_FINAL));  
        $this->stateMachine->addState(new State('denied', StateInterface::TYPE\_FINAL));  
  
        $this->stateMachine->addTransition('submit', 'created', 'submitted');  
        $this->stateMachine->addTransition('approve', 'submitted', 'approved');  
        $this->stateMachine->addTransition('deny', 'submitted', 'denied');  
  
        $this->stateMachine->setObject($this);  
        $this->stateMachine->initialize();  
    }  
  
    public function execute()  
    {  
        // loan created  
  
        yield await(fn () => $this->isSubmitted());  
  
        // loan submitted  
  
        yield await(fn () => $this->isApproved() || $this->isDenied());  
  
        // loan approved/denied  
  
        return $this->stateMachine->getCurrentState()->getName();  
    }  
}
```

In this example, we define a `LoanApplicationWorkflow` class that extends `Workflow` and implements `StatefulInterface`. The workflow has four states: created, submitted, approved or denied. The workflow transitions between these states by externally calling the `submit()`, `approve()`, and `deny()` signal methods.

To use the `LoanApplicationWorkflow`, you can create a new instance of it, start the workflow, submit the loan application, approve it, and get the output as follows:

```php
// create workflow  
$workflow = WorkflowStub::make(LoanApplicationWorkflow::class);  
  
// start workflow  
$workflow->start();  
  
sleep(1);  
  
// submit signal  
$workflow->submit();  
  
sleep(1);  
  
// approve signal  
$workflow->approve();  
  
sleep(1);  
  
$workflow->output();  
// "approved"
```

This is the view from [Waterline](https://github.com/durable-workflow/waterline).

![timeline](https://miro.medium.com/max/1400/1*m6cOftX9kjBjr6CJGpyQPA.webp)

Conclusion
==========

Although Workflow offers a way to define and manage workflows and activities, some developers might still prefer to use a state machine to have more explicit control over the transitions between states or activities.

A state machine can provide a more structured and visual representation of the workflow, making it easier to understand and maintain. In such cases, a state machine library can be integrated with Workflow. This allows developers to define their workflow states, activities, and transitions using the state machine library while still leveraging Workflow’s features, such as queuing, parallel execution, error handling, retries, and integration with Laravel’s queue and event systems.

The Laravel developer community has created several state machine packages that can be integrated with Workflow, such as the following:

- https://github.com/yohang/Finite
- https://github.com/spatie/laravel-model-states
- https://github.com/sebdesign/laravel-state-machine
- https://github.com/symfony/workflow

By integrating a state machine library with Workflow, developers can get the best of both worlds: the flexibility and modularity of Workflow and the explicit control and visualization of a state machine. This can help to create more maintainable, robust, and scalable workflows for complex business processes.
