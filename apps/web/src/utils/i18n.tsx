'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type Locale = 'en' | 'ja' | 'es' | 'hi';

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ja: '日本語',
  es: 'Español',
  hi: 'हिन्दी',
};

const translations: Record<Locale, Record<string, string>> = {
  en: {
    // Header
    'nav.upload': 'Upload',
    'nav.pricing': 'Pricing',
    'nav.help': 'How to Use',
    // Upload page
    'upload.title': 'Photo to Line Art',
    'upload.subtitle': "Upload a photo. We'll create line art, then you paint back the colors.",
    'upload.drop': 'Drop an image here, or click to select',
    'upload.formats': 'JPEG, PNG, WebP / Max 10MB',
    'upload.error.type': 'JPEG, PNG, WebP only.',
    'upload.error.size': 'File must be under 10MB.',
    'upload.error.storage': 'Image is too large to process in this browser. Try a smaller image.',
    // Editor
    'editor.tools': 'Tools',
    'editor.brush': 'Brush (B)',
    'editor.eraser': 'Eraser (E)',
    'editor.brushSize': 'Brush Size',
    'editor.zoom': 'Zoom',
    'editor.lineArt': 'Line Art',
    'editor.style': 'Style',
    'editor.style.rough': 'Rough',
    'editor.style.fine': 'Fine',
    'editor.style.bold': 'Bold',
    'editor.style.sketch': 'Sketch',
    'editor.style.minimal': 'Minimal',
    'editor.style.dot': 'Dot',
    'editor.threshold': 'Line Threshold',
    'editor.thickness': 'Line Thickness',
    'editor.feather': 'Feather',
    'editor.invert': 'Invert Mask',
    'editor.undo': 'Undo',
    'editor.redo': 'Redo',
    'editor.export': 'Export',
    'editor.exporting': 'Exporting...',
    'editor.free': 'Free',
    'editor.credit': 'credit',
    'editor.credits': 'credits',
    'editor.generating': 'Generating line art...',
    'editor.aiMode': 'AI mode — threshold/thickness are ignored.',
    'editor.exportInfo.1024': '1024px: free with watermark.',
    'editor.exportInfo.2048': '2048px: 1 credit, no watermark.',
    'editor.exportInfo.4096': '4096px: 3 credits, no watermark.',
    'editor.exportInfo.noCode': 'No code? Exports have BETA watermark.',
    'editor.image': 'Image',
    'editor.error.rate': 'Rate limit exceeded. Please wait a moment and try again.',
    'editor.error.credits': 'Insufficient credits. Purchase more on the Pricing page.',
    'editor.error.code': 'Invalid redeem code. Check the Pricing page.',
    // Help modal
    'help.title': 'How to Use',
    'help.step1.title': '1. Upload',
    'help.step1.desc': 'Upload a photo (JPEG, PNG, WebP, max 10MB).',
    'help.step2.title': '2. Line Art',
    'help.step2.desc': 'Line art is generated automatically. Choose Rough or Fine style.',
    'help.step3.title': '3. Paint',
    'help.step3.desc': 'Use the brush to reveal original colors. Use the eraser to hide them.',
    'help.step4.title': '4. Export',
    'help.step4.desc': '1024px is free (with watermark). 2048/4096px require credits.',
    'help.shortcuts': 'Keyboard Shortcuts',
    'help.close': 'Close',
  },
  ja: {
    'nav.upload': 'アップロード',
    'nav.pricing': '料金',
    'nav.help': '使い方',
    'upload.title': '写真を線画に変換',
    'upload.subtitle': '写真をアップロードすると線画を生成します。ブラシで元の色を塗り戻せます。',
    'upload.drop': '画像をドロップ、またはクリックして選択',
    'upload.formats': 'JPEG, PNG, WebP / 最大10MB',
    'upload.error.type': 'JPEG, PNG, WebPのみ対応',
    'upload.error.size': '10MB以下のファイルを選択してください',
    'upload.error.storage': '画像が大きすぎます。小さい画像をお試しください。',
    'editor.tools': 'ツール',
    'editor.brush': 'ブラシ (B)',
    'editor.eraser': '消しゴム (E)',
    'editor.brushSize': 'ブラシサイズ',
    'editor.zoom': 'ズーム',
    'editor.lineArt': '線画',
    'editor.style': 'スタイル',
    'editor.style.rough': 'ラフ',
    'editor.style.fine': '精密',
    'editor.style.bold': '太線',
    'editor.style.sketch': 'スケッチ',
    'editor.style.minimal': 'ミニマル',
    'editor.style.dot': 'ドット',
    'editor.threshold': '線の閾値',
    'editor.thickness': '線の太さ',
    'editor.feather': 'ぼかし',
    'editor.invert': 'マスク反転',
    'editor.undo': '戻す',
    'editor.redo': 'やり直し',
    'editor.export': '書き出し',
    'editor.exporting': '書き出し中...',
    'editor.free': '無料',
    'editor.credit': 'クレジット',
    'editor.credits': 'クレジット',
    'editor.generating': '線画を生成中...',
    'editor.aiMode': 'AIモード — 閾値/太さは無視されます。',
    'editor.exportInfo.1024': '1024px: 透かし付き無料',
    'editor.exportInfo.2048': '2048px: 1クレジット、透かしなし',
    'editor.exportInfo.4096': '4096px: 3クレジット、透かしなし',
    'editor.exportInfo.noCode': 'コード未設定の場合はBETA透かし付き',
    'editor.image': '画像',
    'editor.error.rate': 'リクエスト制限に達しました。しばらくお待ちください。',
    'editor.error.credits': 'クレジット不足です。料金ページで購入してください。',
    'editor.error.code': '無効なリディームコードです。料金ページを確認してください。',
    'help.title': '使い方',
    'help.step1.title': '1. アップロード',
    'help.step1.desc': '写真をアップロードします（JPEG, PNG, WebP、最大10MB）。',
    'help.step2.title': '2. 線画生成',
    'help.step2.desc': '線画が自動生成されます。ラフまたは精密スタイルを選べます。',
    'help.step3.title': '3. 色を塗る',
    'help.step3.desc': 'ブラシで元の色を復元します。消しゴムで非表示にできます。',
    'help.step4.title': '4. 書き出し',
    'help.step4.desc': '1024pxは無料（透かし付き）。2048/4096pxはクレジットが必要です。',
    'help.shortcuts': 'キーボードショートカット',
    'help.close': '閉じる',
  },
  es: {
    'nav.upload': 'Subir',
    'nav.pricing': 'Precios',
    'nav.help': 'Cómo usar',
    'upload.title': 'Foto a línea de arte',
    'upload.subtitle': 'Sube una foto. Crearemos un dibujo lineal y podrás pintar los colores.',
    'upload.drop': 'Arrastra una imagen aquí o haz clic para seleccionar',
    'upload.formats': 'JPEG, PNG, WebP / Máx 10MB',
    'upload.error.type': 'Solo JPEG, PNG, WebP.',
    'upload.error.size': 'El archivo debe ser menor a 10MB.',
    'upload.error.storage': 'La imagen es demasiado grande. Intenta con una más pequeña.',
    'editor.tools': 'Herramientas',
    'editor.brush': 'Pincel (B)',
    'editor.eraser': 'Borrador (E)',
    'editor.brushSize': 'Tamaño del pincel',
    'editor.zoom': 'Zoom',
    'editor.lineArt': 'Línea de arte',
    'editor.style': 'Estilo',
    'editor.style.rough': 'Grueso',
    'editor.style.fine': 'Fino',
    'editor.style.bold': 'Negrita',
    'editor.style.sketch': 'Boceto',
    'editor.style.minimal': 'Mínimo',
    'editor.style.dot': 'Punto',
    'editor.threshold': 'Umbral de línea',
    'editor.thickness': 'Grosor de línea',
    'editor.feather': 'Difuminado',
    'editor.invert': 'Invertir máscara',
    'editor.undo': 'Deshacer',
    'editor.redo': 'Rehacer',
    'editor.export': 'Exportar',
    'editor.exporting': 'Exportando...',
    'editor.free': 'Gratis',
    'editor.credit': 'crédito',
    'editor.credits': 'créditos',
    'editor.generating': 'Generando línea de arte...',
    'editor.aiMode': 'Modo IA — umbral/grosor se ignoran.',
    'editor.exportInfo.1024': '1024px: gratis con marca de agua.',
    'editor.exportInfo.2048': '2048px: 1 crédito, sin marca de agua.',
    'editor.exportInfo.4096': '4096px: 3 créditos, sin marca de agua.',
    'editor.exportInfo.noCode': '¿Sin código? Exportaciones con marca BETA.',
    'editor.image': 'Imagen',
    'editor.error.rate': 'Límite de solicitudes. Espera un momento.',
    'editor.error.credits': 'Créditos insuficientes. Compra más en Precios.',
    'editor.error.code': 'Código inválido. Revisa la página de Precios.',
    'help.title': 'Cómo usar',
    'help.step1.title': '1. Subir',
    'help.step1.desc': 'Sube una foto (JPEG, PNG, WebP, máx 10MB).',
    'help.step2.title': '2. Línea de arte',
    'help.step2.desc': 'Se genera automáticamente. Elige estilo Grueso o Fino.',
    'help.step3.title': '3. Pintar',
    'help.step3.desc': 'Usa el pincel para revelar colores. Usa el borrador para ocultarlos.',
    'help.step4.title': '4. Exportar',
    'help.step4.desc': '1024px es gratis (con marca). 2048/4096px requieren créditos.',
    'help.shortcuts': 'Atajos de teclado',
    'help.close': 'Cerrar',
  },
  hi: {
    'nav.upload': 'अपलोड',
    'nav.pricing': 'मूल्य',
    'nav.help': 'कैसे उपयोग करें',
    'upload.title': 'फ़ोटो को लाइन आर्ट में बदलें',
    'upload.subtitle': 'फ़ोटो अपलोड करें। हम लाइन आर्ट बनाएंगे, फिर आप रंग वापस पेंट कर सकते हैं।',
    'upload.drop': 'यहाँ छवि ड्रॉप करें या चुनने के लिए क्लिक करें',
    'upload.formats': 'JPEG, PNG, WebP / अधिकतम 10MB',
    'upload.error.type': 'केवल JPEG, PNG, WebP।',
    'upload.error.size': 'फ़ाइल 10MB से छोटी होनी चाहिए।',
    'upload.error.storage': 'छवि बहुत बड़ी है। छोटी छवि आज़माएँ।',
    'editor.tools': 'उपकरण',
    'editor.brush': 'ब्रश (B)',
    'editor.eraser': 'इरेज़र (E)',
    'editor.brushSize': 'ब्रश का आकार',
    'editor.zoom': 'ज़ूम',
    'editor.lineArt': 'लाइन आर्ट',
    'editor.style': 'शैली',
    'editor.style.rough': 'मोटा',
    'editor.style.fine': 'बारीक',
    'editor.style.bold': 'बोल्ड',
    'editor.style.sketch': 'स्केच',
    'editor.style.minimal': 'न्यूनतम',
    'editor.style.dot': 'डॉट',
    'editor.threshold': 'रेखा सीमा',
    'editor.thickness': 'रेखा मोटाई',
    'editor.feather': 'धुंधलापन',
    'editor.invert': 'मास्क उलटें',
    'editor.undo': 'पूर्ववत',
    'editor.redo': 'फिर से करें',
    'editor.export': 'निर्यात',
    'editor.exporting': 'निर्यात हो रहा है...',
    'editor.free': 'मुफ़्त',
    'editor.credit': 'क्रेडिट',
    'editor.credits': 'क्रेडिट',
    'editor.generating': 'लाइन आर्ट बना रहे हैं...',
    'editor.aiMode': 'AI मोड — सीमा/मोटाई को अनदेखा किया जाता है।',
    'editor.exportInfo.1024': '1024px: वॉटरमार्क के साथ मुफ़्त।',
    'editor.exportInfo.2048': '2048px: 1 क्रेडिट, बिना वॉटरमार्क।',
    'editor.exportInfo.4096': '4096px: 3 क्रेडिट, बिना वॉटरमार्क।',
    'editor.exportInfo.noCode': 'कोड नहीं? BETA वॉटरमार्क लगेगा।',
    'editor.image': 'छवि',
    'editor.error.rate': 'अनुरोध सीमा पार। कृपया प्रतीक्षा करें।',
    'editor.error.credits': 'अपर्याप्त क्रेडिट। मूल्य पृष्ठ पर खरीदें।',
    'editor.error.code': 'अमान्य कोड। मूल्य पृष्ठ जाँचें।',
    'help.title': 'कैसे उपयोग करें',
    'help.step1.title': '1. अपलोड',
    'help.step1.desc': 'फ़ोटो अपलोड करें (JPEG, PNG, WebP, अधिकतम 10MB)।',
    'help.step2.title': '2. लाइन आर्ट',
    'help.step2.desc': 'लाइन आर्ट स्वतः बनता है। मोटा या बारीक शैली चुनें।',
    'help.step3.title': '3. पेंट करें',
    'help.step3.desc': 'ब्रश से रंग प्रकट करें। इरेज़र से छिपाएँ।',
    'help.step4.title': '4. निर्यात',
    'help.step4.desc': '1024px मुफ़्त (वॉटरमार्क)। 2048/4096px के लिए क्रेडिट चाहिए।',
    'help.shortcuts': 'कीबोर्ड शॉर्टकट',
    'help.close': 'बंद करें',
  },
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const saved = localStorage.getItem('locale') as Locale | null;
    if (saved && translations[saved]) {
      setLocaleState(saved);
    }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('locale', l);
    document.documentElement.lang = l;
  }, []);

  const t = useCallback(
    (key: string) => translations[locale]?.[key] ?? translations.en[key] ?? key,
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
