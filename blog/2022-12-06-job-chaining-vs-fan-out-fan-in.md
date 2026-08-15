---
slug: job-chaining-vs-fan-out-fan-in
title: "Laravel Job Chaining vs. Fan-Out/Fan-In"
description: "Compare sequential Laravel job chaining with parallel fan-out/fan-in in a Workflow example that converts PDF pages concurrently, then merges the results."
authors:
  name: Richard
  title: Core Team
  url: https://github.com/rmcdaniel
  image_url: https://github.com/rmcdaniel.png
tags: [chaining, fan-out, fan-in, batching]
---

import ThemedImage from '@site/src/components/ThemedImage';

[Laravel job chaining](https://laravel.com/docs/9.x/queues#job-chaining) fits work that must run step by step, with one activity's output feeding the next. When independent activities can run at the same time and their outputs must be recombined, fan-out/fan-in is the better fit. This guide compares both patterns, then builds a Workflow PDF pipeline that converts pages concurrently before merging them.

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNptkctOwzAQRX8lmhVIaYhtnIeFuoAoK9iwpOnCjZ2HlNiV64hHlB9hx6_xJThpC4vizfjOnTN3MSOUWkhgUHX6tWy4sd7jc6E893K0-f78utuZm3U-qNK2Wnloe_Sye7S5yrjlO36Q16dmji8B_AvgfwByCRDnnfO91Wo9Ry01xyd5rDkBH2rTCmDWDNKHXpqezxLGmS_ANrKXBTD3FbLiQ2cLKNTksD1XL1r3Z9LooW6AVbw7ODXsBbcya3lt-N-IVEKaBz0oCwyRZQWwEd5mFQaEEIToLcaUhrEP78AISgIcIxInYUSx86PJh48lNAxoSglKoyQhOEQ0TX2QorXaPB1PsVxk-gF0nnts?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNptkU1ugzAQha-CZtVKhGI75seqsmgRq3bTZUMWDnYANdiRY9QfxEW669V6khpIsklnM_Pm6Zu3mB5KLSQw2O31e1lzY72nl0J5rnK0_v3-ud-au1XeqdI2WnloM3vZA1rfZNzyLT_K29Myx9cAvgD4H4BcA8R553xvsViNUVPP8UnOPSfgQ2UaAcyaTvrQStPyUUI_8gXYWrayAOZGwc1bAYUaHHPg6lXr9owZ3VU1sB3fH53qDoJbmTW8Mry9bI1UQppH3SkLbBmT6QiwHj6AIRIGhBCE6BJjSsPYh09gBCUBjhGJkzCi2PnR4MPXFBsGNKUEpVGSEBwimqY-SNFYbZ7nT0wPGf4AtoR6rg?type=png"
  lightLink="https://mermaid.live/edit#pako:eNptkctOwzAQRX8lmhVIaYhtnIeFuoAoK9iwpOnCjZ2HlNiV64hHlB9hx6_xJThpC4vizfjOnTN3MSOUWkhgUHX6tWy4sd7jc6E893K0-f78utuZm3U-qNK2Wnloe_Sye7S5yrjlO36Q16dmji8B_AvgfwByCRDnnfO91Wo9Ry01xyd5rDkBH2rTCmDWDNKHXpqezxLGmS_ANrKXBTD3FbLiQ2cLKNTksD1XL1r3Z9LooW6AVbw7ODXsBbcya3lt-N-IVEKaBz0oCwyRZQWwEd5mFQaEEIToLcaUhrEP78AISgIcIxInYUSx86PJh48lNAxoSglKoyQhOEQ0TX2QorXaPB1PsVxk-gF0nnts"
  darkLink="https://mermaid.live/edit#pako:eNptkU1ugzAQha-CZtVKhGI75seqsmgRq3bTZUMWDnYANdiRY9QfxEW669V6khpIsklnM_Pm6Zu3mB5KLSQw2O31e1lzY72nl0J5rnK0_v3-ud-au1XeqdI2WnloM3vZA1rfZNzyLT_K29Myx9cAvgD4H4BcA8R553xvsViNUVPP8UnOPSfgQ2UaAcyaTvrQStPyUUI_8gXYWrayAOZGwc1bAYUaHHPg6lXr9owZ3VU1sB3fH53qDoJbmTW8Mry9bI1UQppH3SkLbBmT6QiwHj6AIRIGhBCE6BJjSsPYh09gBCUBjhGJkzCi2PnR4MPXFBsGNKUEpVGSEBwimqY-SNFYbZ7nT0wPGf4AtoR6rg"
  alt="Job Chaining Diagram"
/>

In contrast, the fan-out/fan-in pattern involves dividing a task into smaller sub-tasks and then combining the results of those sub-tasks to produce the final result. This pattern is often used to parallelize a task and improve its performance by leveraging the power of multiple queue workers.

<ThemedImage
  lightSrc="https://mermaid.ink/img/pako:eNptkUtOwzAQhq8SzQqkNMQ2zsNCXUDUFWxY0nThNs5DSuzKdcQjykXYcTVOgpM0raB45X8-fzMjuYOdygQwyGv1uiu5Ns7jcyode1Zo_f35dbfVN8tVK3emUtJBm4kl92h9lXDDt_wgrm3xqGBz6eDNDJv_4dwS_245OuRSIedxyFkslsMyp63Ggl3jCPCUyV_ezDyV4EKhqwyY0a1woRG64UOEbpBSMKVoRArMXjOR87Y2KaSyt9qeyxelmtnUqi1KYDmvDza1-4wbkVS80Pz8RMhM6AfVSgMMkbEFsA7ehuR7hBCE6C3GlPqhC-_ACIo8HCISRn5AseVB78LHONT3aEwJioMoIthHNI5dEFlllH6afnT82P4HgHeQGg?type=png"
  darkSrc="https://mermaid.ink/img/pako:eNptkU1ugzAQRq-CZtVKhGI7mMSqsmhRVu2my4YsHHAANbYjx6g_iIt016v1JDUQErWpV57v6c2MNA1kOhfAYLvTr1nJjfUenlLlubdEq-_Pr9uNuVksa5XZSisPrQeW3KHVVcIt3_CDuHbhUcH20sHrEcr_4dgS_27ZO-RSIedxyJtMFt0yp636wK1xBHioyV8uR54q8KEwVQ7Mmlr4IIWRvCuh6aQUbCmkSIG5b87NSwqpap2z5-pZazlqRtdFCWzLdwdX1fucW5FUvDBcnlIjVC7Mva6VBTYlcd8EWANvwBAJA0IIQtEU4ygKHXwHRtAswDEi8SykEXactj589GPDIJpHBM1pTCl1CvVB5JXV5nG4Z3_W9gchII8n?type=png"
  lightLink="https://mermaid.live/edit#pako:eNptkUtOwzAQhq8SzQqkNMQ2zsNCXUDUFWxY0nThNs5DSuzKdcQjykXYcTVOgpM0raB45X8-fzMjuYOdygQwyGv1uiu5Ns7jcyode1Zo_f35dbfVN8tVK3emUtJBm4kl92h9lXDDt_wgrm3xqGBz6eDNDJv_4dwS_245OuRSIedxyFkslsMyp63Ggl3jCPCUyV_ezDyV4EKhqwyY0a1woRG64UOEbpBSMKVoRArMXjOR87Y2KaSyt9qeyxelmtnUqi1KYDmvDza1-4wbkVS80Pz8RMhM6AfVSgMMkbEFsA7ehuR7hBCE6C3GlPqhC-_ACIo8HCISRn5AseVB78LHONT3aEwJioMoIthHNI5dEFlllH6afnT82P4HgHeQGg"
  darkLink="https://mermaid.live/edit#pako:eNptkU1ugzAQRq-CZtVKhGI7mMSqsmhRVu2my4YsHHAANbYjx6g_iIt016v1JDUQErWpV57v6c2MNA1kOhfAYLvTr1nJjfUenlLlubdEq-_Pr9uNuVksa5XZSisPrQeW3KHVVcIt3_CDuHbhUcH20sHrEcr_4dgS_27ZO-RSIedxyJtMFt0yp636wK1xBHioyV8uR54q8KEwVQ7Mmlr4IIWRvCuh6aQUbCmkSIG5b87NSwqpap2z5-pZazlqRtdFCWzLdwdX1fucW5FUvDBcnlIjVC7Mva6VBTYlcd8EWANvwBAJA0IIQtEU4ygKHXwHRtAswDEi8SykEXactj589GPDIJpHBM1pTCl1CvVB5JXV5nG4Z3_W9gchII8n"
  alt="Fan-out/Fan-in Diagram"
/>

There are two phases: fan-out and fan-in.

In the fan-out phase, the workflow divides the main task into smaller sub-tasks and assigns each of those sub-tasks to a different activity. In the fan-in phase, the workflow collects the results of the activities and combines them to produce the final result.

The below workflow represents a simple example of a fan-out/fan-in pattern in which multiple activities are executed in parallel and their results are then merged together.

The workflow divides the task of creating a PDF into activities, with each activity responsible for rendering a single page of the document. Once the individual pages have been rendered, the fan-in phase of the workflow combines the rendered pages into a single PDF document.

```php
namespace App\Workflows\BuildPDF;

use Workflow\Workflow;
use function Workflow\{activity, all};

class BuildPDFWorkflow extends Workflow
{
    public function execute()
    {
        $page1 = activity(ConvertURLActivity::class, 'https://example.com/');
        $page2 = activity(ConvertURLActivity::class, 'https://example.com/');

        $pages = yield all([$page1, $page2]);

        $result = yield activity(MergePDFActivity::class, $pages);

        return $result;
    }
}
```

The `ConvertURLActivity` is passed a URL as an argument, and it converts the contents of that URL into a PDF document. Because two separate activities are created, this results in the execution of two instances of `ConvertURLActivity` in parallel.

```php
namespace App\Workflows\BuildPDF;

use Illuminate\Support\Facades\Http;
use Workflow\Activity;

class ConvertURLActivity extends Activity
{
    public function execute($url)
    {
        $fileName = uniqid() . '.pdf';

        Http::withHeaders([
            'Apikey' => 'YOUR-API-KEY-GOES-HERE',
        ])
        ->withOptions([
            'sink' => storage_path($fileName),
        ])
        ->post('https://api.cloudmersive.com/convert/web/url/to/pdf', [
            'Url' => $url,
        ]);

        return $fileName;
    }
}
```

Next, the `BuildPDFWorkflow` uses `all()` to wait for both `ConvertURLActivity` instances to complete. This is an example of the fan-in part of the fan-out/fan-in pattern, as it collects the results of the parallel activities and combines them into a single array of PDF files.

Finally, the `BuildPDFWorkflow` executes the`MergePDFActivity`, which is passed the array of PDFs that were generated by the `ConvertURLActivity` instances, and merges them into a single PDF document.

```php
namespace App\Workflows\BuildPDF;

use setasign\Fpdi\Fpdi;
use Workflow\Activity;

class MergePDFActivity extends Activity
{
    public function execute($pages)
    {
        $fileName = uniqid() . '.pdf';

        $pdf = new Fpdi();

        foreach ($pages as $page) {
            $pdf->AddPage();
            $pdf->setSourceFile(storage_path($page));
            $pdf->useTemplate($pdf->importPage(1));
        }

        $pdf->Output('F', storage_path($fileName));

        foreach ($pages as $page) {
            unlink(storage_path($page));
        }

        return $fileName;
    }
}
```

This is what the final PDF looks like…

![merged PDF](https://miro.medium.com/max/1400/1*A3PKGEk8JptFIxB9IqCh6w.webp)

Overall, using the fan-out/fan-in pattern in this way can significantly reduce the time it takes to create a PDF document, making the process more efficient and scalable.

Thanks for reading!
