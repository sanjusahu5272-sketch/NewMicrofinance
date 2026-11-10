<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="csrf-token" content="{{ csrf_token() }}" />
  <title>{{ config('app.name', 'NEEV 4D — Microfinance SaaS Core Banking ERP') }}</title>
    <link rel="stylesheet" href="/assets/app.css" />
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" crossorigin="anonymous" />
    <link rel="stylesheet" href="/assets/icons.css" />
</head>
<body class="software-2-neev-ui">
  <div id="root"></div>
  <script src="/assets/app.js"></script>
  <script src="/assets/icons.js" defer></script>
</body>
</html>
