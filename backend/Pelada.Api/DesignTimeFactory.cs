using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Pelada.Api;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<PeladaDb>
{
    public PeladaDb CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<PeladaDb>()
        .UseNpgsql(Environment.GetEnvironmentVariable("ConnectionStrings__Postgres") ?? "Host=localhost;Database=resenha;Username=resenha")
        .Options);
}
