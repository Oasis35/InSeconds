# Dev image — hot reload via `dotnet watch`.
# Le code source est monté en volume (voir docker-compose), bin/obj masqués
# par des volumes anonymes pour éviter les conflits binaires Windows/Linux.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS dev

WORKDIR /src

# Restore en couche dédiée pour profiter du cache Docker au build initial.
COPY global.json ./
COPY InSeconds.Api/InSeconds.Api.csproj InSeconds.Api/
RUN dotnet restore InSeconds.Api/InSeconds.Api.csproj

# Polling nécessaire : les events de fichiers ne traversent pas
# fiablement un bind mount Windows -> conteneur Linux.
ENV DOTNET_USE_POLLING_FILE_WATCHER=1
ENV ASPNETCORE_URLS=http://+:8080

EXPOSE 8080

ENTRYPOINT ["dotnet", "watch", "run", \
    "--project", "InSeconds.Api/InSeconds.Api.csproj", \
    "--non-interactive", \
    "--urls", "http://+:8080"]
