# 005. Realtime over Socket.IO

## Context

Нужны двусторонние события: transcript, AI status, card, teacher intervention, presence. Аудио позже может уйти в WebRTC.

## Decision

Socket.IO namespace `/realtime`, строго типизированные события в `@sys112/shared-types`. Комната `call:{id}`.

SSE отвергнут: intervention и join/leave удобнее в одном двустороннем канале. Чистый WebSocket возможен, но reconnect/rooms в Socket.IO закрывают риск обрыва во время звонка.

## Alternatives

Отдельный realtime-сервис. Полезно при многих инстансах. Сейчас события идут через in-process `EventBusPort`.

## Consequences

Медиа-транспорт (WebRTC) можно добавить рядом, не ломая event protocol.
