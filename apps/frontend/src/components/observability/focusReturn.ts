let lastTriggerElement: HTMLElement | null = null

export const setLastDrawerTriggerElement = (el: HTMLElement | null) => {
  lastTriggerElement = el
}

export const focusLastDrawerTriggerElement = () => {
  if (!lastTriggerElement) return
  lastTriggerElement.focus()
}
