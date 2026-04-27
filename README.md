# Controle de Gás

App pessoal para acompanhar o consumo de botijões de gás da casa. A partir do registro de compras, instalações e quando os botijões terminam, o app estima quando o próximo precisará ser comprado.

## Funcionalidades

- **Dashboard** — mostra o status atual de cada botijão (chuveiro e cozinha) com estimativa de dias restantes
- **Reserva** — acompanha se tem reserva em estoque
- **Registrar** — registra compras, instalações e términos
- **Histórico** — ciclos anteriores e estatísticas de duração por período
- **Offline-first** — funciona sem internet, sincroniza com JSONBin quando disponível

## Tech stack

- Vite + Vanilla JS (sem framework)
- Chart.js para gráficos
- localforage para cache offline
- JSONBin.io como backend (opcional)
- PWA — instalável como app nativo

## Desenvolvimento

```bash
npm install
npm run dev      # inicia dev server
npm run build   # build de produção
npm run preview # testa build
```

## Configuração (opcional)

Sem configurações, o app usa apenas cache local. Para sincronizar na nuvem:

1. Crie uma conta em https://jsonbin.io
2. Crie um Bin com estrutura inicial:
   ```json
   {
     "state": { "chuveiro": null, "cozinha": null, "reserva": "vazio" },
     "cycles": [],
     "purchases": []
   }
   ```
3. Adicione ao `.env`:
   ```
   VITE_JSONBIN_KEY=sua_master_key
   VITE_JSONBIN_BIN_ID=seu_bin_id
   ```
