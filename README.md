# HINKredience° – přihlašovací stránka

Statická stránka pro přihlášení a schválení přístupu (OAuth 2.1) ke kuchařce
HINKredience°. Běží na GitHub Pages.

- `oauth/consent/` – přihlášení a tlačítko „Povolit přístup“
- `vendor/` – knihovna supabase-js 2.119.0 (licence MIT), uložená zde, aby se
  nenačítala z cizího serveru

Stránka neobsahuje žádné tajné klíče. Adresa projektu a veřejný
(*publishable*) klíč jsou určené k použití v prohlížeči; přístup k datům řídí
přihlášení a pravidla v databázi.
