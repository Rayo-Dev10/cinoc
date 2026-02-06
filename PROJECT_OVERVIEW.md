# Avance IES — Resumen del Proyecto

Este proyecto es una app web estática para gestionar el avance académico y planificar la **inscripción de materias** con validación de requisitos y colisiones de horario. Está orientada a dos programas: **Administración de Empresas** y **Contaduría Pública**.

## Qué hace
- Muestra el avance por créditos, materias completadas y homologadas.
- Permite mover materias entre semestres (con correquisitos).
- Permite **Modo Inscripción**: sugerencias de materias disponibles según horario, rango de horas y requisitos.
- Importa/exporta el progreso en JSON.

## Archivos clave
- `index.html`: shell básico, carga `styles.css` y `app.js`.
- `styles.css`: estilos de toda la UI (incluye Modo Inscripción).
- `app.js`: toda la lógica, render y estado.
- `curriculum.json`: malla curricular, créditos, prerequisitos/correquisitos y alias.
- `horarios2026A.json`: **fuente de verdad** de oferta de materias y horarios.

## Datos: cómo están organizados

### `curriculum.json`
- `course_catalog`: catálogo canónico de materias (id, nombre, créditos, aliases).
- `program_plans`: semestres por programa con créditos.
- `program_requisites`: reglas de prerequisitos/correquisitos.
- `canonicalization`: normalización de nombres y alias manuales.

### `horarios2026A.json`
- `s`: materias ofrecidas por semestre (lista de claves).
- `m`: detalle por materia:
  - `n`: nombre visible (fuente principal para inscripción).
  - `a`: alias opcional.
  - `op`: opciones de horario (lista de sesiones con día/hora).

## Modo Inscripción (visión rápida)
La inscripción usa **`horarios2026A.json` como fuente principal** y cruza con `curriculum.json` para:
- Determinar semestre y créditos.
- Validar prerequisitos/correquisitos.
- Evitar colisiones horarias.

### Flujo
1. Usuario activa **Modo Inscripción**.
2. Selecciona hora de inicio/fin.
3. El sistema lista materias disponibles:
   - No completadas/homologadas.
   - Sin colisión de horario.
   - Cumplen prerequisitos (y correquisitos si se inscriben juntos).
4. Usuario elige una opción horaria por materia.
5. Se muestra el horario en tabla por días y bloques.

## Mapeo entre nombres (horarios ↔ currículo)
El cruce usa:
- `course_catalog.<id>.aliases`
- `canonicalization.known_aliases`
- `m.<clave>.a` en `horarios2026A.json`

**Recomendación:** si una materia no muestra semestre/créditos, agrega alias:
- En `curriculum.json` → `course_catalog.<id>.aliases`
- En `curriculum.json` → `canonicalization.known_aliases`
- En `horarios2026A.json` → `m.<clave>.a`

## Estado y persistencia
Todo el estado vive en `localStorage`:
- `courseStatus`: completada/homologada.
- `customNames`: alias visibles editables.
- `placements`: semestre planeado por materia.
- `enrollment`: preferencias y materias seleccionadas en inscripción.

## Puntos de extensión frecuentes
- **Agregar materias/horarios:** editar `horarios2026A.json`.
- **Corregir nombres o equivalencias:** ajustar alias en `curriculum.json`.
- **Nuevos filtros o reglas de inscripción:** `computeEnrollmentAvailable()` en `app.js`.
- **Pintado del horario:** `renderEnrollmentGrid()` en `app.js`.

## Ideas de mejoras futuras
- Mostrar por qué una materia está bloqueada (prerrequisitos faltantes).
- Selector de programa para semestre/créditos (actualmente usa Contaduría).
- Exportar calendario de inscripción.
