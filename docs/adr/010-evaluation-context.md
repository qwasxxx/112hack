# 010. Evaluation as its own context

## Context

Оценка зависит от transcript, карточки, алгоритма и версии критериев. Её нельзя смешать с live prompt.

## Decision

Модуль `evaluation`. Запуск асинхронно после звонка. Результат структурированный (`EvaluationResult`), с evidence, mistakes, confidence, versions.

## Alternatives

Один LLM-комментарий в конце звонка. Не воспроизводимо и не пригодно для прогресса.

## Consequences

Можно сменить evaluation model, не трогая scenario engine. Для воспроизводимости храним snapshot входа.
