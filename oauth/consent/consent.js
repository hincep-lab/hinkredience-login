'use strict';

// Stránka se nesmí zobrazit vložená v cizím rámu (ochrana proti podvrženému klikání).
if (window.top !== window.self) {
  document.documentElement.innerHTML = '';
  throw new Error('Stránku nelze zobrazit v rámu.');
}

(() => {
  // Veřejná adresa projektu a veřejný (publishable) klíč – nejsou tajné,
  // přístup k datům řídí přihlášení a Row Level Security.
  const SUPABASE_URL = 'https://wjqpzoeheonjwdyyezhb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_7kKqba-VFfNiKka5RYjGpQ_LpdS-LMl';

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const authorizationId = new URLSearchParams(location.search).get('authorization_id');
  const $ = (id) => document.getElementById(id);
  const sections = ['loading', 'login', 'consent', 'done'];

  function show(name) {
    for (const id of sections) $(id).hidden = id !== name;
  }
  function fail(message) {
    $('error').textContent = message;
    $('error').hidden = !message;
  }
  function finish(text) {
    $('done-text').textContent = text;
    show('done');
  }
  function leave(result) {
    const target = result?.redirect_url ?? result?.redirect_to;
    if (target) location.replace(target);
    else finish('Hotovo. Toto okno můžete zavřít.');
  }

  async function loadConsent() {
    fail('');
    show('loading');
    const { data: session } = await client.auth.getSession();
    if (!session?.session) return show('login');

    const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId);
    if (error) {
      fail('Žádost o přístup se nepodařilo načíst: ' + error.message);
      return finish('Zkuste propojení v ChatGPT spustit znovu.');
    }
    // Bez authorization_id v odpovědi už byl přístup dříve schválen.
    if (!data?.authorization_id && (data?.redirect_url || data?.redirect_to)) return leave(data);

    $('client-name').textContent = data?.client?.name || data?.client?.client_name || 'neznámá aplikace';
    $('user-email').textContent = session.session.user.email ?? '';
    try {
      $('redirect-host').textContent = new URL(data.redirect_uri ?? data.redirect_url).host;
    } catch {
      $('redirect-host').textContent = 'neznámou adresu';
    }
    show('consent');
  }

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    fail('');
    const button = event.target.querySelector('button');
    button.disabled = true;
    const { error } = await client.auth.signInWithPassword({
      email: $('email').value.trim(),
      password: $('password').value,
    });
    button.disabled = false;
    if (error) return fail('Nesprávný e-mail nebo heslo.');
    $('password').value = '';
    loadConsent();
  });

  async function decide(approve) {
    fail('');
    $('approve').disabled = $('deny').disabled = true;
    const { data, error } = approve
      ? await client.auth.oauth.approveAuthorization(authorizationId)
      : await client.auth.oauth.denyAuthorization(authorizationId);
    $('approve').disabled = $('deny').disabled = false;
    if (error) return fail('Nepodařilo se to dokončit: ' + error.message);
    leave(data);
  }
  $('approve').addEventListener('click', () => decide(true));
  $('deny').addEventListener('click', () => decide(false));
  $('switch').addEventListener('click', async () => {
    await client.auth.signOut({ scope: 'local' });
    show('login');
  });

  if (!authorizationId) {
    finish('Tato stránka slouží k povolení přístupu ke kuchařce HINKredience°. Otevřete ji z ChatGPT při propojování.');
  } else {
    loadConsent().catch((e) => { fail('Neočekávaná chyba: ' + e.message); show('done'); });
  }
})();
