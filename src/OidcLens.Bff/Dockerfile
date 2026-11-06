FROM node:24-bookworm-slim AS web
WORKDIR /web
COPY src/web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY src/web/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/OidcLens.Bff/OidcLens.Bff.csproj src/OidcLens.Bff/
RUN dotnet restore src/OidcLens.Bff/OidcLens.Bff.csproj
COPY src/OidcLens.Bff/ src/OidcLens.Bff/
RUN dotnet publish src/OidcLens.Bff/OidcLens.Bff.csproj --no-restore -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
COPY --from=web /web/dist/ ./wwwroot/
USER $APP_UID
ENTRYPOINT ["dotnet", "OidcLens.Bff.dll"]
