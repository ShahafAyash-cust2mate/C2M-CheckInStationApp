# C2M Check-in Station Setup v13

## New in this version

- Added `data/local-cloud-db-default.json`.
- Added **File -> Reset app data to default**.
- Clicking reset overwrites `data/local-cloud-db.json` with `data/local-cloud-db-default.json` and reloads the app.

You can edit the default values in:

```text
data/local-cloud-db-default.json
```

Runtime app data is stored in:

```text
data/local-cloud-db.json
```

## Run

```cmd
npm install
npm run dev
```
