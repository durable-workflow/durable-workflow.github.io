---
slug: waterline-ui
title: "Waterline: Elegant UI for Workflows"
authors:
  name: Richard
  title: Core Team
  url: https://github.com/rmcdaniel
  image_url: https://github.com/rmcdaniel.png
tags: [ui, horizon, queues, workflows]
---

:::info V2 Update
This post was written for Durable Workflow v1. For v2, the package name has changed from `durable-workflow/waterline` to `durable-workflow/waterline`. See the [migration guide](/docs/2.0/migration/) for details.
:::

One of the pros to using workflows is that it makes monitoring easy. Using Waterline makes it even easier!

![dashboard](https://miro.medium.com/max/1400/1*2FP4crjpM8C48kAnqAjv5A.webp)

Look familiar? Yes, this is shamelessly based on Horizon! However, the similarity is only superficial. Waterline is geared towards workflows, not queues. In fact, Horizon is still the best way to monitor your queues and plays along nicely with it.

> Waterline is to workflows what Horizon is to queues.

![workflow view](https://miro.medium.com/max/1400/1*EKWNNFy6kYRrqMbaozA8IQ.webp)

At this point you can see a lot of differences! You can see the arguments passed to the workflow and the output from the completed workflow. You can see a timeline that shows each activity at a glance along with any exceptions that were thrown. There is also a list view for the activities and their results.

At the bottom are any exceptions thrown, including a stack trace and a snippet of code showing the exact line. This makes debugging a breeze.

If you’re familiar with Horizon then installing Waterline will be like déjà vu but the setup is simpler because Waterline doesn’t care about queues, only workflows.

## Installation

You can find the official [documentation](https://github.com/durable-workflow/waterline) here but setup is simple.

```bash
composer require durable-workflow/waterline  
  
php artisan waterline:publish
```

That’s it! Now you should be able to view the `/waterline` URL in your app. By default this URL is only available in local environments. To view this outside of local environments you will have to modify the `WaterlineServiceProvider`.

```php
Gate::define('viewWaterline', function ($user) {  
    return in_array($user->email, [  
        'admin@example.com',  
    ]);  
});
```

This will allow only the single admin user to access the Waterline UI.

If you want more context for the workflow that is show in the screenshot above, make sure to read my [previous article](https://medium.com/@laravel-workflow/email-verifications-using-laravel-workflow-acd6707aa7b3).

Thanks for reading!
