FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/Pelada.Api/Pelada.Api.csproj Pelada.Api/
RUN dotnet restore Pelada.Api/Pelada.Api.csproj
COPY backend/Pelada.Api/ Pelada.Api/
RUN dotnet publish Pelada.Api/Pelada.Api.csproj -c Release -o /out --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS tests
WORKDIR /src
COPY backend/ ./
RUN dotnet restore Pelada.Tests/Pelada.Tests.csproj
ENTRYPOINT ["dotnet", "test", "Pelada.Tests/Pelada.Tests.csproj", "--no-restore", "--logger", "console;verbosity=normal"]

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /out ./
RUN mkdir /app/keys && chown app:app /app/keys
USER $APP_UID
ENV ASPNETCORE_HTTP_PORTS=8080 DATA_PROTECTION_PATH=/app/keys
EXPOSE 8080
ENTRYPOINT ["dotnet", "Pelada.Api.dll"]
