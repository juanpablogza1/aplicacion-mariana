# La cocina de Mariana

Web app instalable (PWA) para:

- **Despensa**: inventario de lo que hay en casa, con cantidades, aviso de "se está acabando" y fecha de caducidad.
- **Ideas**: recetas sugeridas según lo que hay, sus gustos, lo que no le gusta y su antojo del momento ("algo rápido con pollo para Gabriel"). Prioriza lo que caduca pronto.
- **Súper**: lista de compras. Se llena sola con lo que se acaba y con lo que le falta a una receta. Lo comprado pasa a la despensa con un botón.
- **Gustos**: le encanta / no le gusta, vegetariano, sin gluten, respaldo de datos.

Los datos se guardan en el teléfono (localStorage). Funciona sin internet.

## Ideas con IA (opcional)
En **Gustos** se puede pegar una clave de API de Anthropic. Con eso aparece el botón "Pedir ideas nuevas a la IA", que inventa recetas con lo que hay. La clave se queda solo en ese teléfono.

## Publicar
GitHub → Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`.
URL: `https://juanpablogza1.github.io/aplicacion-mariana/`

## Instalar en el teléfono
- **iPhone (Safari)**: Compartir → *Agregar a pantalla de inicio*.
- **Android (Chrome)**: menú ⋮ → *Instalar app*.

## Archivos
`index.html`, `styles.css`, `app.js` (lógica), `recipes.js` (recetario: agregar recetas aquí), `sw.js` (offline), `manifest.webmanifest`, `icons/`.
