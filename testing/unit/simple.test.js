
// Simple test to verify Jest is working
test('Basic test setup', () => {
  expect(1 + 1).toBe(2);
});

describe('Test suite', () => {
  it('should pass this test', () => {
    const result = 2 * 3;
    expect(result).toBe(6);
  });
});