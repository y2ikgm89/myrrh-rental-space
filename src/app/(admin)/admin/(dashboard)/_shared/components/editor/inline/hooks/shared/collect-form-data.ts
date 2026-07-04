type SupportedFormControl =
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function appendInputValue(formData: FormData, input: HTMLInputElement): void {
  if (
    input.type === "button" ||
    input.type === "submit" ||
    input.type === "reset" ||
    input.type === "image"
  ) {
    return;
  }

  if (input.type === "checkbox" || input.type === "radio") {
    if (input.checked) {
      formData.append(input.name, input.value);
    }
    return;
  }

  if (input.type === "file") {
    for (const file of Array.from(input.files ?? [])) {
      formData.append(input.name, file);
    }
    return;
  }

  formData.append(input.name, input.value);
}

function appendSelectValue(
  formData: FormData,
  select: HTMLSelectElement,
): void {
  if (select.multiple) {
    for (const option of Array.from(select.selectedOptions)) {
      formData.append(select.name, option.value);
    }
    return;
  }

  formData.append(select.name, select.value);
}

/**
 * Build FormData from the currently mounted settings controls without relying on
 * Conform's FieldMetadata snapshot. The actual form exists for Conform's
 * form association, while Radix Tabs and footer actions stay outside it.
 */
export function collectFormDataFromContainer(container: HTMLElement): FormData {
  const formData = new FormData();
  const controls = container.querySelectorAll<SupportedFormControl>(
    "input, select, textarea",
  );

  for (const control of controls) {
    if (control.disabled || control.name === "") {
      continue;
    }

    if (control instanceof HTMLInputElement) {
      appendInputValue(formData, control);
    } else if (control instanceof HTMLSelectElement) {
      appendSelectValue(formData, control);
    } else {
      formData.append(control.name, control.value);
    }
  }

  return formData;
}
