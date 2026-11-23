# Auditoría responsive y de accesibilidad

**Fecha:** 23 de noviembre de 2026  
**Herramientas:** Playwright, axe-core / `@axe-core/playwright`, Chromium.  
**Colores probados en BusinessSettings:** principal `#244d40`, acento `#bb5c37`, fondo `#faf8f2`.

## Cobertura

Se capturaron 16 vistas en 360, 768 y 1280 px: 6 rutas públicas (`/`, `/login`, `/cabanas` y las fichas de bosque, río y cerro) y 10 vistas autenticadas del panel (resumen, listado y formulario de cabañas, las tres fichas editables, solicitudes, detalle de una solicitud E2E, calendario y configuración). Total: 48 capturas y 48 análisis axe. Los datos de la solicitud y la sesión fueron ficticios; la aplicación corrió sobre una copia temporal y una base `cabanias_test` efímera.

## Hallazgos

### Desbordes horizontales

No se encontró desbordamiento horizontal en ninguna de las 48 vistas.

### Texto cortado

No se encontró texto recortado por el diseño de página. En 360 px, dos áreas de texto del panel sí necesitan desplazamiento interno para mostrar todo su valor inicial: `Política de cancelación` en `/admin/configuracion` (174 caracteres; el contenido supera la altura visible en 22 px) y `Descripción` en `/admin/cabanas/{id}` (162 caracteres; también supera en 22 px). El texto permanece en el campo y se puede recorrer dentro de él; el campo solo muestra cuatro filas.

### Contraste insuficiente — serio para axe

Axe registró 44 instancias serias de contraste insuficiente entre vistas y tamaños. Los pares que fallan el mínimo 4.5:1 son:

| Texto | Fondo | Contraste | Dónde aparece |
| --- | --- | ---: | --- |
| `#bb5c37` | `#faf8f2` | 4.20:1 | Antetítulos y enlaces “Explorar” del sitio público; antetítulos principales del panel |
| `#bb5c37` | `#fff` | 4.46:1 | Antetítulos sobre paneles blancos |
| `#bb5c37` | `#e8ecdf` | 3.72:1 | Antetítulo de presentación en el inicio |
| `#bb5c37` | `#e9ecdf` | 3.73:1 | Antetítulo del pie y superficies verdes claras |
| `#bb5c37` | `#e9eddf` | 3.75:1 | Antetítulos del panel administrativo |
| `#6c766b` | `#faf8f2` | 4.45:1 | Texto secundario pequeño del inicio |
| `#667064` | `#e8ecdf` | 4.30:1 | Texto de la sección de presentación |
| `#65705f` | `#e9ecdf` | 4.34:1 | Texto pequeño del pie público |

### Nombres accesibles

No se encontraron controles visibles sin nombre accesible. Axe sí marcó 6 instancias serias de `label-content-name-mismatch`: los enlaces “Explorar” de Bosque, Río y Cerro tienen un `aria-label` que dice “Ver Refugio …”, pero omite su texto visible (“Explorar”). Aparece en inicio y catálogo, en los tres tamaños. El nombre existe, pero no contiene la etiqueta que una persona ve.

### Foco visible y tabulación

No se detectaron controles con foco de teclado sin indicador visible en las 48 vistas. El orden observado es secuencial y coincide con el contenido: el primer Tab enfoca “Saltar al contenido”; luego navega marca y menú, contenido principal y, en páginas públicas, pie de página. En el panel pasa por marca, navegación administrativa, enlace al sitio público, cierre de sesión y contenido. No se observaron saltos de orden.

### Objetivos táctiles menores de 44 px

El conteo mecánico incluye enlaces de texto dentro de párrafos y casillas de 20×20 px cuyo texto asociado también es clicable; estos casos no equivalen todos a botones táctiles insuficientes. Los objetivos dedicados más claros bajo el umbral solicitado son:

| Elemento | 360 px | 768 y 1280 px |
| --- | --- | --- |
| Navegación pública “Cabañas” / “Contacto” | 51×21 px | 56×23 px |
| Enlace público “Administración” | 97×34 px | 107×36 px |
| Marca enlazada del encabezado | 324×28 px | 446×28 px en público |
| Navegación del panel (cada uno de 5 enlaces) | 159×40 px | 159×40 px |
| Marca enlazada del panel | 324×34 px | 165×34 px / 205×34 px |
| Enlaces “Volver” independientes | 72–142×22 px | 72–142×22 px |

Además, los enlaces independientes “Explorar” miden 58×26 px a 360 y 1280 px, y 223×19 px a 768 px. Las casillas de confirmación de eliminación son 20×20 px, aunque se pueden activar desde su etiqueta asociada.

### Otras violaciones de axe

- **30 instancias moderadas de `region`:** el aviso inferior del panel (`.admin-disclaimer`) queda fuera de una región semántica; se repite en las 10 vistas administrativas y los tres tamaños.
- **3 instancias moderadas de `heading-order`:** en `/cabanas`, las tarjetas usan encabezados `h3` sin un `h2` previo en la jerarquía.

**Resumen axe:** 83 registros de violación (50 serios, 33 moderados, 0 críticos). Las cifras incluyen repeticiones de la misma regla por ruta y tamaño.

## Capturas y datos

- [Descargar las 48 capturas PNG](screenshots-360-768-1280.zip)
- [Resultados completos de axe y mediciones responsive](audit-results.json)
- [Orden de tabulación y controles revisados](keyboard-results.json)
## Resultado posterior a las correcciones

Se repitió el análisis axe sobre las mismas 16 vistas en 360, 768 y 1280 px: **0 violaciones**, incluidas las serias y críticas. La prueba E2E permanente cubre estas 48 combinaciones y falla si axe detecta impacto serio o crítico. La revisión responsive posterior tampoco encontró desbordamiento horizontal, texto recortado por el diseño, controles visibles sin nombre ni áreas de texto con contenido fuera de la altura visible.

El conteo geométrico posterior todavía registra casillas nativas de 17–20 px dentro de etiquetas de confirmación con área pulsable mínima de 44 px, y enlaces de correo en línea. Los demás objetivos dedicados detectados en la auditoría inicial ya alcanzan el umbral de 44 px. El ZIP conserva las capturas de la auditoría inicial; el JSON original mantiene los hallazgos previos para comparación.