# C2M Check-in Station Setup

גרסה מתוקנת עם מבנה נקי ויציב.

## מה להחליף

מומלץ לחלץ את הקובץ לתיקייה נקייה. אם מחליפים בתוך הפרויקט הקיים, יש להחליף את הקבצים והתיקיות הבאים:

- `package.json`
- `vite.config.ts`
- `index.html`
- `tsconfig.json`
- `scripts/wait-and-start-electron.cjs`
- `src/main/main.cjs`
- `src/main/preload.cjs`
- `src/cloud/localCloud.cjs`
- `src/renderer/main.tsx`
- `src/renderer/styles.css`
- `src/renderer/global.d.ts`
- `data/local-cloud-db.json`
- `data/local-cloud-db.example.json`

## קבצים/תיקיות שמומלץ למחוק מהפרויקט הישן

כדי למנוע בלבול בין כמה גרסאות של renderer/main/preload, מחק אם קיימים:

- `src/renderer/index.html`
- `src/renderer/src/`
- `src/main/index.ts`
- `src/preload/`
- `src/shared/`
- `scripts/dev.cjs`
- `scripts/build.cjs`
- `scripts/build-renderer.cjs`
- `tsconfig.main.json`
- `data/mock-db.json`
- `data/mock-cloud-log.json`

בנוסף, אחרי החלפה מומלץ למחוק:

- `node_modules`
- `package-lock.json`

ואז להריץ התקנה מחדש.

## הרצה

```cmd
npm install
npm run dev
```

## בדיקות

```cmd
npm run check
```

## הסיבה לחלון הריק

בפרויקט הישן היו כמה `index.html` וכמה כניסות שונות ל־renderer:

- `index.html` בשורש
- `src/renderer/index.html`
- `src/renderer/main.tsx`
- `src/renderer/src/main.tsx`
- `src/renderer/src/App.tsx`

בנוסף `vite.config.ts` הגדיר `root: src/renderer`, אבל Electron טען את ה־URL הראשי. זה יצר מצב שבו Vite מגיש HTML אחר מזה שציפינו, ולכן החלון עלה אבל React לא נטען.

בגרסה הזו יש כניסה אחת בלבד:

```text
index.html -> /src/renderer/main.tsx
```

ו־Vite עובד משורש הפרויקט, בלי `root` מותאם.

## הפרדת צד אפליקציה וצד ענן

```text
src/main/              Electron main + IPC
src/cloud/             Mock Cloud מקומי
src/renderer/          React UI
data/local-cloud-db.json   DB מקומי
```

כשנעבור לענן אמיתי, מחליפים את `src/cloud/localCloud.cjs` בקריאות API אמיתיות.

## DB מקומי

`data/local-cloud-db.json` כולל את כל הטבלאות והשדות. השורות הן תבנית בלבד, עם ערכי `null`/מחרוזות ריקות. אפשר למלא ידנית.

אם רוצים דוגמת seed, יש קובץ:

```text
data/local-cloud-db.example.json
```
