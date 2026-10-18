/**
 * Após validar (cliente ou API), leva o foco ao primeiro campo inválido do
 * formulário. Dois frames garantem que o React já aplicou aria-invalid.
 */
export function focusFirstInvalid(form: HTMLFormElement | null) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    }),
  )
}
