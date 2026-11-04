# Image de prod de l'API. Contexte de build : src/back.
# Seuls InSeconds.Api, InSeconds.Deezer, InSeconds.Waveform et InSeconds.Infrastructure sont copiés : l'hôte de test (InSeconds.Api.Testing,
# routes /api/e2e, faux email) ne peut pas s'y retrouver (S9). La CI le vérifie sur l'image construite.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY global.json Directory.Build.props Directory.Packages.props ./
COPY InSeconds.Api/InSeconds.Api.csproj InSeconds.Api/
COPY InSeconds.Deezer/InSeconds.Deezer.csproj InSeconds.Deezer/
COPY InSeconds.Waveform/InSeconds.Waveform.csproj InSeconds.Waveform/
COPY InSeconds.Infrastructure/InSeconds.Infrastructure.csproj InSeconds.Infrastructure/
RUN dotnet restore InSeconds.Api/InSeconds.Api.csproj

COPY InSeconds.Api/ InSeconds.Api/
COPY InSeconds.Deezer/ InSeconds.Deezer/
COPY InSeconds.Waveform/ InSeconds.Waveform/
COPY InSeconds.Infrastructure/ InSeconds.Infrastructure/
RUN dotnet publish InSeconds.Api/InSeconds.Api.csproj \
    --configuration Release \
    --output /app/publish \
    --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
# Commit déployé (posé par deploy.sh), rendu par GET /api/admin/system : en dernier, pour qu'il n'invalide aucune couche coûteuse.
ARG GIT_COMMIT=
ENV BUILD_COMMIT=$GIT_COMMIT
EXPOSE 8080

USER app

ENTRYPOINT ["dotnet", "InSeconds.Api.dll"]
