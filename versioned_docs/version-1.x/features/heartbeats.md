---
sidebar_position: 6
---

# Heartbeats

Heartbeats are sent at regular intervals to indicate that an activity is still running and hasn't frozen or crashed. They prevent the activity from being terminated due to timing out. This enables long-running activities to have a relatively low timeout. As long as the activity sends a heartbeat faster than the timeout duration, it will not be terminated.

```php
use Workflow\Activity;

class MyActivity extends Activity
{
    public $timeout = 5;

    public function execute()
    {
      while (true) {
        sleep(1);

        $this->heartbeat();
      }
    }
}
```

import HeartbeatSimulator from '@site/src/components/HeartbeatSimulator';

<HeartbeatSimulator />

In the above example, even though the activity would normally be terminated after running for 5 seconds, the periodic heartbeat allows it to keep running. If the activity does freeze or crash then the heartbeat will stop and the timeout will be triggered.
