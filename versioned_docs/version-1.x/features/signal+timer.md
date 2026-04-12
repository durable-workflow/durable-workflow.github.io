---
sidebar_position: 4
---

# Signal + Timer

In some cases, you may want to wait for a signal or for a timer to expire, whichever comes first. This can be achieved by using `awaitWithTimeout($timeout, $condition)`.

```php
use function Workflow\awaitWithTimeout;
use Workflow\SignalMethod;
use Workflow\Workflow;

class MyWorkflow extends Workflow
{
    private bool $ready = false;

    #[SignalMethod]
    public function setReady($ready)
    {
        $this->ready = $ready;
    }

    public function execute()
    {
        $result = yield awaitWithTimeout('5 minutes', fn () => $this->ready);
    }
}
```

import SignalTimerSimulator from '@site/src/components/SignalTimerSimulator';

<SignalTimerSimulator />

The workflow will reach the call to `awaitWithTimeout()` and then hibernate until either some external code signals the workflow like this.

```php
$workflow->setReady();
```

Or, if the specified timeout is reached, the workflow will continue without the signal. The return value is `true` if the signal was received before the timeout, or `false` if the timeout was reached without receiving the signal.
