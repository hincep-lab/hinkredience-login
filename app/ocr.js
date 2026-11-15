// HINKredience° – čtení textu z fotky v prohlížeči (Tesseract, čeština).
// Vše běží v zařízení; soubory čtečky jsou na stejném serveru jako aplikace
// (složka ocr/) a načtou se až při prvním použití.
(function () {
  'use strict';

  const base = () => new URL('ocr/', document.baseURI).href;
  let loading = null;

  function load() {
    if (window.Tesseract) return Promise.resolve();
    loading ??= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = base() + 'tesseract.min.js';
      s.onload = () => resolve();
      s.onerror = () => {
        loading = null;
        reject(new Error('HINK_LOAD'));
      };
      document.head.appendChild(s);
    });
    return loading;
  }

  async function checkImage(url) {
    // Ověření, že jde opravdu o obrázek (ne poškozený soubor).
    const blob = await (await fetch(url)).blob();
    if (!blob.size) throw new Error('HINK_BAD_IMAGE');
    try {
      const bitmap = await createImageBitmap(blob);
      bitmap.close && bitmap.close();
    } catch (_) {
      throw new Error('HINK_BAD_IMAGE');
    }
    return blob;
  }

  window.hinkOcr = {
    async read(url) {
      const blob = await checkImage(url);
      await load();
      let worker;
      try {
        worker = await window.Tesseract.createWorker('ces', 1, {
          workerPath: base() + 'worker.min.js',
          corePath: base(),
          langPath: base(),
          gzip: true,
        });
      } catch (e) {
        throw new Error('HINK_LOAD ' + e);
      }
      try {
        const { data } = await worker.recognize(blob);
        return data.text || '';
      } finally {
        worker.terminate();
      }
    },
  };
})();
