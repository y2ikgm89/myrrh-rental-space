---
description: "Testing standards and best practices for unit, integration, and E2E tests"
globs:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "tests/**"
alwaysApply: false
---

# Testing Standards

This rule provides guidance for writing and maintaining tests.

## Test Structure

- **Unit tests**: `tests/unit/` - Test individual functions and components
- **Integration tests**: `tests/integration/` - Test component interactions
- **E2E tests**: `tests/e2e/` - Test complete user flows (Playwright)
- **Test coverage target**: 80% or higher

## Test Execution

Before running tests, always run:
1. `bun run lint` - Fix linting errors
2. `bun run type-check` - Fix type errors
3. `bun run test` - Run all tests

### Test Commands

- **Run all tests**: `bun run test`
- **Run specific test file**: `bun run test reservation-form.test.tsx`
- **Watch mode**: `bun run test:watch`
- **Coverage report**: `bun run test:coverage`
- **E2E tests**: `bun run test:e2e` (Playwright)
- **E2E UI mode**: `bun run test:e2e:ui`

## Test Best Practices

- **Always add/update tests**: When changing code, update or add corresponding tests
- **Clear descriptions**: Use descriptive `describe` and `it` blocks
- **Minimal mocking**: Use mocks sparingly (prefer real implementations when possible)
- **Independent tests**: Tests must be independently executable
- **Test coverage**: Maintain test coverage reports

## Test Coverage Areas

- Form validation (Zod schemas)
- Authentication flows (login, logout, session management)
- Reservation flows (create, update, delete)
- Customer management (profile management, statistics calculation)
- Admin CRUD operations
- Server Actions
- API routes (Route Handlers)
- Error handling

## Bun Test Runner Mocking and Spying

- **Use `mock()`**: For creating mock functions
- **Use `spyOn()`**: For monitoring calls to existing functions without replacing them
- **Reset mocks**: Always reset mocks between tests for isolation
- **Lifecycle hooks**: Use `beforeAll`, `beforeEach`, `afterEach`, `afterAll` for setup and teardown

```typescript
// ✅ Good: Function mocks with Bun test runner
import { test, expect, mock } from 'bun:test'

const random = mock(() => Math.random())

test('random', () => {
  const val = random()
  expect(val).toBeGreaterThan(0)
  expect(random).toHaveBeenCalled()
  expect(random).toHaveBeenCalledTimes(1)
})

// ✅ Good: Spies for monitoring function calls
import { test, expect, spyOn } from 'bun:test'

const service = {
  fetchData() {
    // Original implementation
  },
}

const spy = spyOn(service, 'fetchData')

test('fetchData is called', () => {
  service.fetchData()
  expect(spy).toHaveBeenCalled()
  expect(spy.mock.calls).toEqual([[]])
})

// ✅ Good: Lifecycle hooks for setup and teardown
import { beforeAll, beforeEach, afterEach, afterAll } from 'bun:test'

beforeAll(() => {
  // Setup before all tests
})

beforeEach(() => {
  // Setup before each test
})

afterEach(() => {
  // Cleanup after each test
  // Reset mocks for isolation
})

afterAll(() => {
  // Cleanup after all tests
})
```

## Test Example

```typescript
import { describe, it, expect, mock } from 'bun:test'
import { render, screen } from '@testing-library/react'
import { ReservationForm } from '@/components/public/reservation-form'

describe('ReservationForm', () => {
  const mockOnSubmit = mock(async () => {})

  it('should render form fields correctly', () => {
    render(<ReservationForm spaceId="space-1" onSubmit={mockOnSubmit} />)
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/time/i)).toBeInTheDocument()
  })

  it('should validate required fields', async () => {
    // Test implementation
  })
})
```

## Quality Checks

The agent will automatically run relevant programmatic checks and fix failures before finishing tasks:
- Lint checks (`bun run lint`)
- Type checks (`bun run type-check`)
- Test execution (`bun run test`)

For detailed testing requirements, see [`docs/TEST_REQUIREMENTS.md`](../../docs/TEST_REQUIREMENTS.md).
