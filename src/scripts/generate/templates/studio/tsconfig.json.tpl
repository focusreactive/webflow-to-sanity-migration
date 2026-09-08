{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": true
  },
  "include": ["sanity.config.ts", "sanity.cli.ts", "src/**/*.ts", "src/**/*.tsx", "scripts/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
