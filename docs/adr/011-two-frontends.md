# 011. Two frontend apps

## Context

Student и Teacher — разные задачи, разные экраны, разный риск ошибок в UI.

## Decision

`apps/student-web` и `apps/teacher-web`. Shared: types, api-client, ui tokens.

Role-specific flow не смешивается. Один bundle не содержит teacher intervention UI у студента.

## Alternatives

Одно приложение с route guards. Быстрее старт, выше риск утечки control-UI и сложнее раздельный деплой/доступ.

## Consequences

Два dev-server. Дизайн-система должна оставаться тонкой.
