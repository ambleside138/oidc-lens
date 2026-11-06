FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/OidcLens.ResourceApi/OidcLens.ResourceApi.csproj src/OidcLens.ResourceApi/
RUN dotnet restore src/OidcLens.ResourceApi/OidcLens.ResourceApi.csproj
COPY src/OidcLens.ResourceApi/ src/OidcLens.ResourceApi/
RUN dotnet publish src/OidcLens.ResourceApi/OidcLens.ResourceApi.csproj --no-restore -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
USER $APP_UID
ENTRYPOINT ["dotnet", "OidcLens.ResourceApi.dll"]
