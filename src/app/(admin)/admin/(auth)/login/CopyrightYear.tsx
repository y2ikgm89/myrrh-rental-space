'use client'

export function CopyrightYear() {
  return (
    <p className="text-center text-xs text-muted-foreground mt-6">
      © {new Date().getFullYear()} Myrrh Rental Space
    </p>
  )
}
