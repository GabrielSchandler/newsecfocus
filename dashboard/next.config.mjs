/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Recharts é pesado; otimiza a importação de ícones e libs de UI.
    optimizePackageImports: ["lucide-react", "recharts"],
  },
};

export default nextConfig;
