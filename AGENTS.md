# Instrucciones para agentes

- Lee la documentacion relevante de `docs/` e inspecciona el codigo relacionado antes de implementar.
- Busca y reutiliza sistemas, contratos y utilidades existentes siempre que sea razonable; no dupliques logica.
- Disena el cambio minimo necesario. Evita soluciones temporales, overengineering y refactors masivos no relacionados.
- Mantiene responsabilidades claras entre logica, presentacion y orquestacion, con el menor acoplamiento posible.
- Preserva las funcionalidades existentes salvo que la tarea exija cambiarlas.
- Elimina codigo muerto o duplicado derivado de tus cambios.
- Valida con los comandos disponibles y revisa regresiones antes de finalizar.
- La documentacion describe el codigo; no debe sustituirlo ni repetir detalles faciles de obtener al leerlo.

## Flujo de trabajo

1. Leer las instrucciones y documentacion relevante.
2. Inspeccionar el codigo relacionado con la tarea.
3. Identificar sistemas reutilizables.
4. Disenar el cambio minimo necesario.
5. Implementarlo respetando la arquitectura existente.
6. Ejecutar las validaciones disponibles.
7. Revisar posibles regresiones.
8. Eliminar codigo muerto o duplicado generado por el cambio.
9. Actualizar `PROJECT_STATE.md`, `GAME_SYSTEMS.md` o `DECISIONS.md` unicamente si el cambio modifica informacion relevante.
