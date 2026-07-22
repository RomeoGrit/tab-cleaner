# Tab Cleaner

Chrome/Chromium plėtinys, kuris parodo visus atidarytus tabus viename popup lange, sugrupuotus pagal domeną — su galimybe vienu paspaudimu uždaryti tiek atskirą tabą, tiek visą domeną.

## Funkcijos

- Tabai sugrupuoti pagal domeną su faviconu ir tabų skaičiumi
- Uždaryti vieną tabą arba visą domeną (✕ mygtukai)
- Paieška pagal pavadinimą, URL ar domeną
- Rikiavimas: pagal domeną (A-Z), tabų skaičių, arba naujausiai naudotus
- Sutraukti/išskleisti domeno grupes (po vieną arba visas vienu mygtuku)
- „Uždaryti visus tabus" mygtukas
- Pinned tabai ignoruojami (lieka nesuardomi)
- Realaus laiko atnaujinimas — tabų pokyčiai matomi iškart
- Aktyvus tabas paryškintas; paspaudimas ant tabo perjungia į jį
- Jokių patvirtinimo langų — tabai uždaromi iškart

## Įdiegimas

1. Atidaryk `chrome://extensions/` (arba `vivaldi://extensions/`)
2. Įjunk **Developer mode**
3. Spausk **Load unpacked**
4. Pasirink šį katalogą

## Struktūra

```
├── manifest.json    # Manifest V3
├── popup.html       # Popup UI
├── popup.js         # Visa popup logika
├── popup.css        # Stiliai
├── AGENTS.md        # Techninė dokumentacija
└── icons/           # Ikonėlės
```

## Po kodo pakeitimų

- Paspausk refresh ikoną ant extension kortelės `chrome://extensions/`
- Uždaryk ir iš naujo atidaryk popup

## Licencija

MIT
