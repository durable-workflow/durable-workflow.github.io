---
slug: email-verifications
title: Email Verifications Using Workflow
authors:
  name: Richard
  title: Core Team
  url: https://github.com/rmcdaniel
  image_url: https://github.com/rmcdaniel.png
tags: [emails, verification, signed-urls]
---

import ThemedImage from '@site/src/components/ThemedImage';

A typical registration process goes as follows:

1.  User fills out registration form and submits it
2.  Laravel creates user in database with null `email_verified_at`
3.  Laravel sends email with a code, or a link back to our website
4.  User enters code, or clicks link
5.  Laravel sets `email_verified_at` to the current time

What’s wrong with this? Nothing. But like all things, as soon as real world complexity creeps in, this pattern could become painful. What if you wanted to send an email after the code or link expires? And do you really need a user in your database if they never verify their email address?

Let’s take this trivial example and replace it with a workflow. This is based on the [Workflow library](https://github.com/durable-workflow/workflow) (the Laravel-native durable workflow package).

Get Started
===========

Create a standard Laravel application and create the following files. First, the API routes.

```php
use App\Workflows\VerifyEmail\VerifyEmailWorkflow;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Workflow\WorkflowStub;

Route::get('/register', function () {
    $workflow = WorkflowStub::make(VerifyEmailWorkflow::class);

    $workflow->start(
        'test+1@example.com',
        Hash::make('password'),
    );

    return response()->json([
        'workflow_id' => $workflow->id(),
    ]);
});

Route::get('/verify-email', function () {
    $workflow = WorkflowStub::load(request('workflow_id'));

    $workflow->verify();

    return response()->json('ok');
})->name('verify-email');
```

The `register` route creates a new `VerifyEmailWorkflow` , passes in the email and password, and then starts the workflow. Notice that we hash the password before giving it to the workflow. This prevents the plain text from being stored in the workflow logs.

The `verify-email` route receives a workflow id, loads it and then calls the `verify()` signal method.

Now let’s take a look at the actual workflow.

```php
use Workflow\SignalMethod;
use Workflow\Workflow;
use function Workflow\{activity, await};

class VerifyEmailWorkflow extends Workflow
{
    private bool $verified = false;

    #[SignalMethod]
    public function verify()
    {
        $this->verified = true;
    }

    public function execute($email = '', $password = '')
    {
        yield activity(SendEmailVerificationEmailActivity::class, $email);

        yield await(fn () => $this->verified);

        yield activity(VerifyEmailActivity::class, $email, $password);
    }
}
```

Take notice of the `yield` keywords. Because PHP (and most other languages) cannot save their execution state, coroutines rather than normal functions are used inside of workflows (but not activities). A coroutine will be called multiple times in order to execute to completion.

| Normal Function | Coroutine |
|-----------------|-----------|
| <ThemedImage lightSrc="https://mermaid.ink/img/pako:eNplkU1vwyAMhv9K5HNaEUIH4bBLq562204LO9DgNJESqChoH1X--0i6al8-2a_fxwb5Ao0zCBLawb02nfYhe9opm6U4x8PR61OXPdB6H20Temdfrq059oWuPYbobyJao-xftKi3ehjQ_wC3CWyS-Es61An_Pyh5s9Xqfl52FfZfQiKUhRyOvjcgg4-Yw4h-1HMJl9msIHQ4ogKZUoOtjkNQoOyUsJO2z86NN9K7eOxAtno4pyqejA6463X6w7clvQr91kUbQBblMgLkBd5AUlKsBeGkEISSigqWwzvIkpG12PDNpqyIYFSUUw4fy06yZpwKzitWMX5HGSU8BzR9cP7xeozlJtMnm-Z59g?type=png" darkSrc="https://mermaid.ink/img/pako:eNplkTtvwyAQgP-KdbNjYYIDZuiSKFO7darpQGxiW7UhuoD6sPLfi52m6uMm7uO-O9BNULvGgITj4F7rTqNPHnfKJjHO4dCiPnXJPa32wda-d_b5ejXHPtcVGh_wBo1tlP2r5tVWD4PBH-I2inWEv9Chivr_RrE2Wa3u5mFXsP8C0VAWUmixb0B6DCaF0eCo5xSmuViB78xoFMh4bDS-KFD2Ep2Ttk_OjTcNXWg7kEc9nGMWTo32Ztfr-IHxm2J8k8GtC9aD5BuxNAE5wRtISvJMEE5yQSgpqWApvINcM5KJghfFuiSCUbG-pPCxTCUZ41RwXrKS8Q1llPAUTNN7hw_XXSwruXwC4h15Pw?type=png" lightLink="https://mermaid.live/edit#pako:eNplkU1vwyAMhv9K5HNaEUIH4bBLq562204LO9DgNJESqChoH1X--0i6al8-2a_fxwb5Ao0zCBLawb02nfYhe9opm6U4x8PR61OXPdB6H20Temdfrq059oWuPYbobyJao-xftKi3ehjQ_wC3CWyS-Es61An_Pyh5s9Xqfl52FfZfQiKUhRyOvjcgg4-Yw4h-1HMJl9msIHQ4ogKZUoOtjkNQoOyUsJO2z86NN9K7eOxAtno4pyqejA6463X6w7clvQr91kUbQBblMgLkBd5AUlKsBeGkEISSigqWwzvIkpG12PDNpqyIYFSUUw4fy06yZpwKzitWMX5HGSU8BzR9cP7xeozlJtMnm-Z59g" darkLink="https://mermaid.live/edit#pako:eNplkTtvwyAQgP-KdbNjYYIDZuiSKFO7darpQGxiW7UhuoD6sPLfi52m6uMm7uO-O9BNULvGgITj4F7rTqNPHnfKJjHO4dCiPnXJPa32wda-d_b5ejXHPtcVGh_wBo1tlP2r5tVWD4PBH-I2inWEv9Chivr_RrE2Wa3u5mFXsP8C0VAWUmixb0B6DCaF0eCo5xSmuViB78xoFMh4bDS-KFD2Ep2Ttk_OjTcNXWg7kEc9nGMWTo32Ztfr-IHxm2J8k8GtC9aD5BuxNAE5wRtISvJMEE5yQSgpqWApvINcM5KJghfFuiSCUbG-pPCxTCUZ41RwXrKS8Q1llPAUTNN7hw_XXSwruXwC4h15Pw" alt="Normal Function Diagram" /> | <ThemedImage lightSrc="https://mermaid.ink/img/pako:eNptkj1vwyAQhv-KdbMTYSAFM3RxtqhL1al2B2JIbMkGC4P6EeW_l9hOm1a5iXuf--BOd4LaKg0CDp19rxvpfPKyrUwSbQz7o5NDkzzjsrDOBt8a_Tazi-2ycgzjoI26FfE9kZRO--DMokVamf9NsrKQXafdTV6BZVlH8Y-0j7XG0Os_Yn1PVKWyPz--6RnLJqvVYxxg9nfZ5MbSV76fOV44Xnh95fXMycLJwmMHSOHoWgXCu6BT6LXr5cWF0yW2At_oXlcg4lPpgwydr6Ay55g2SPNqbX_NjPs-NiAOshujFwYlvd62Mi7rNyTOpF1hg_EgMjKVAHGCDxAYZWuOGMo4wijHnKbwCYJQtOYbttmQHHGKOTmn8DX1RGvKMGcspzllD5hixFLQqvXWPc33MZ3J-RssOJ-L?type=png" darkSrc="https://mermaid.ink/img/pako:eNptkj1vwyAQhv-KdbMTYUwKZujibFGXqlPtDsQQ26oNFgb1I8p_L7GdKKlyE_c-3HscuiNURirgcOjMV9UI66K3bamjEKPf11YMTfSKi9xY412r1cfMzrFLitGPg9LyVsSPxLSwynmrFy3QUv9vkhS56Dplb-pyLIoqiHfSPniNvld3YvVIlIU01xff9Ay20Wr1HAaY810ypcH6wvczxwvHC68uvJp5uvB04aEDxFDbVgJ31qsYemV7cU7heL5bgmtUr0rg4SiF_Syh1KdQMwj9bkx_KQufXTfAD6IbQ-YHKZzatiL8VH9VbZhI2dx47YDTBE8mwI_wDRyjZM0QRQlDGGWYkRh-gKcErdmGbjZphhjBLD3F8Dt1RWtCMaM0IxmhT5hgRGNQsnXGvszrMW3J6Q9Ifp7J?type=png" lightLink="https://mermaid.live/edit#pako:eNptkj1vwyAQhv-KdbMTYSAFM3RxtqhL1al2B2JIbMkGC4P6EeW_l9hOm1a5iXuf--BOd4LaKg0CDp19rxvpfPKyrUwSbQz7o5NDkzzjsrDOBt8a_Tazi-2ycgzjoI26FfE9kZRO--DMokVamf9NsrKQXafdTV6BZVlH8Y-0j7XG0Os_Yn1PVKWyPz--6RnLJqvVYxxg9nfZ5MbSV76fOV44Xnh95fXMycLJwmMHSOHoWgXCu6BT6LXr5cWF0yW2At_oXlcg4lPpgwydr6Ay55g2SPNqbX_NjPs-NiAOshujFwYlvd62Mi7rNyTOpF1hg_EgMjKVAHGCDxAYZWuOGMo4wijHnKbwCYJQtOYbttmQHHGKOTmn8DX1RGvKMGcspzllD5hixFLQqvXWPc33MZ3J-RssOJ-L" darkLink="https://mermaid.live/edit#pako:eNptkj1vwyAQhv-KdbMTYUwKZujibFGXqlPtDsQQ26oNFgb1I8p_L7GdKKlyE_c-3HscuiNURirgcOjMV9UI66K3bamjEKPf11YMTfSKi9xY412r1cfMzrFLitGPg9LyVsSPxLSwynmrFy3QUv9vkhS56Dplb-pyLIoqiHfSPniNvld3YvVIlIU01xff9Ay20Wr1HAaY810ypcH6wvczxwvHC68uvJp5uvB04aEDxFDbVgJ31qsYemV7cU7heL5bgmtUr0rg4SiF_Syh1KdQMwj9bkx_KQufXTfAD6IbQ-YHKZzatiL8VH9VbZhI2dx47YDTBE8mwI_wDRyjZM0QRQlDGGWYkRh-gKcErdmGbjZphhjBLD3F8Dt1RWtCMaM0IxmhT5hgRGNQsnXGvszrMW3J6Q9Ifp7J" alt="Coroutine Diagram" /> |

Even though this workflow will execute to completion effectively once, it will still be partially executed four different times. The results of activities are cached so that only failed activities will be called again. Successful activities get skipped.

But notice that any code we write between these calls will be called multiple times. That’s why your code needs to be **deterministic** inside of workflow methods! If your code has four executions, each at different times, they must still all behave the same. There are no such limitations within activity methods.

Step By Step
============

The first time the workflow executes, it will reach the call to `SendEmailVerificationEmailActivity` , start that activity, and then exit. Workflows suspend execution while an activity is running. After the `SendEmailVerificationEmailActivity` finishes, it will resume execution of the workflow. This brings us to…

The second time the workflow is executed, it will reach the call to `SendEmailVerificationEmailActivity` and skip it because it will already have the result of that activity. Then it will reach the call to `await()` which allows the workflow to wait for an external signal. In this case, it will come from the user clicking on the verification link they receive in their email. Once the workflow is signaled then it will execute for…

The third time, both the calls to `SendEmailVerificationEmailActivity` and `await()` are skipped. This means that the `VerifyEmailActivity` will be started. After the final activity has executed we still have…

The final time the workflow is called, there is nothing left to do so the workflow completes.

Now let’s take a look at the activities.

The first activity just sends the user an email.

```php
namespace App\Workflows\VerifyEmail;

use App\Mail\VerifyEmail;
use Illuminate\Support\Facades\Mail;
use Workflow\Activity;

class SendEmailVerificationEmailActivity extends Activity
{
    public function execute($email)
    {
        Mail::to($email)->send(new VerifyEmail($this->workflowId()));
    }
}
```

The email contains a temporary signed URL that includes the workflow ID.

```php
namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\URL;

class VerifyEmail extends Mailable
{
    use Queueable, SerializesModels;

    private $workflowId;

    public function __construct($workflowId)
    {
        $this->workflowId = $workflowId;
    }

    public function envelope()
    {
        return new Envelope(
            subject: 'Verify Email',
        );
    }

    public function content()
    {
        return new Content(
            view: 'emails.verify-email',
            with: [
                'url' => URL::temporarySignedRoute(
                    'verify-email',
                    now()->addMinutes(30),
                    ['workflow_id' => $this->workflowId],
                ),
            ],
        );
    }

    public function attachments()
    {
        return [];
    }
}
```

The user gets the URL in a clickable link.

```
<a href="{{ $url }}">verification link</a>
```

This link takes the user to the `verify-email` route from our API routes, which will then start the final activity.

```php
namespace App\Workflows\VerifyEmail;

use App\Models\User;
use Workflow\Activity;

class VerifyEmailActivity extends Activity
{
    public function execute($email, $password)
    {
        $user = new User();
        $user->name = '';
        $user->email = $email;
        $user->email_verified_at = now();
        $user->password = $password;
        $user->save();
    }
}
```

We have created the user and verified their email address at the same time. Neat!

Wrapping Up
===========

If we take a look at the output of `php artisan queue:work` we can better see how the workflow and individual activities are interleaved.

![queue worker](https://miro.medium.com/max/1400/1*q6-r41SN-uWfzp6p7Z4r8g.webp)

We can see the four different executions of the workflow, the individual activities and the signal we sent.

The [Workflow](https://github.com/durable-workflow/workflow) library is heavily inspired by [Temporal](https://temporal.io/) but powered by [Laravel Queues](https://laravel.com/docs/9.x/queues).

Thanks for reading!
