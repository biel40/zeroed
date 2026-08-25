# Progresion Ray Gun y ZEUS-77 legendaria

**Que**: se elimina la entrega de Ray Gun a 75 bajas; el unico hito queda en 115 bajas y concede Ray Gun en lugar de ZEUS-77. ZEUS-77 entra en la Mystery Box como resultado legendario de peso 3 (aproximadamente 2.91 % inicial) con reveal dorado.

**Por que**: Ray Gun conserva una garantia de progresion tardia, mientras ZEUS-77 pasa a ser una recompensa excepcional acorde con su letalidad.

**Donde**: `src/modes/ZombiesMode.ts`, `src/zombies/ZombieConfig.ts`, `src/zombies/MysteryBox.ts`, `src/zombies/MysteryBoxView.ts` y pruebas de progresion/caja.

**Aprendido**: ZEUS-77 ya estaba precargada y tenia display procedural compatible con la caja. Los pesos son relativos: al sumar peso 3 al total previo de 100, su probabilidad inicial es `3 / 103` y la de Ray Gun pasa a `10 / 103`.
