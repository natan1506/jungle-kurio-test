// Dois frames para o React já ter aplicado aria-invalid.
export function focusFirstInvalid(form: HTMLFormElement | null) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    }),
  )
}
