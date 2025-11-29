# Contributing to Oddbits

Thank you for your interest in contributing to Oddbits! This document provides guidelines and instructions for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone git@github.com:YOUR_USERNAME/oddbits.git`
3. Install dependencies: `pnpm install`
4. Create a new branch: `git checkout -b feature/your-feature-name`

## Development

### Building

```bash
pnpm build
```

### Running the Web App

```bash
cd apps/web
pnpm dev
```

### Project Structure

- `packages/core/` - Core plugin system
- `packages/*/` - Individual bit packages
- `apps/web/` - Web interface demo

## Creating a New Bit

1. Create a new package in `packages/your-bit-name/`
2. Implement the `BitPlugin` interface from `@oddbits/core`
3. Follow the naming convention: `*bits` (e.g., `colorbits`, `fontbits`)
4. Add a README.md with usage examples
5. Register your bit (optional, for auto-discovery)

See the main README for detailed instructions on creating bits.

## Code Style

- Use TypeScript
- Follow existing code patterns
- Keep it simple and framework-light
- Add comments for complex logic
- Write clear, descriptive commit messages

## Submitting Changes

1. Make sure your code builds: `pnpm build`
2. Test your changes thoroughly
3. Update documentation if needed
4. Commit your changes: `git commit -m "Description of changes"`
5. Push to your fork: `git push origin feature/your-feature-name`
6. Open a Pull Request on GitHub

## Pull Request Guidelines

- Provide a clear description of what the PR does
- Reference any related issues
- Ensure all checks pass
- Keep PRs focused and reasonably sized

## Reporting Bugs

Use the bug report template when opening an issue. Include:
- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Environment details

## Feature Requests

Use the feature request template or new bit proposal template. We welcome ideas for:
- New bits/tools
- Improvements to existing bits
- Architecture enhancements
- Documentation improvements

## Questions?

Feel free to open an issue for questions or discussions!

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

