using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using Pelada.Api;
using Xunit;

namespace Pelada.Tests;

public sealed class NicknameMigrationTests
{
    [PostgresFact]
    public async Task LegacyAccountsKeepPasswordsAndReceiveUniqueValidNicks()
    {
        var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Postgres")!;
        var schema = "nickname_test_" + Guid.NewGuid().ToString("N");
        await using var admin = new NpgsqlConnection(connection);
        await admin.OpenAsync();
        await using (var create = new NpgsqlCommand($"CREATE SCHEMA {schema}", admin)) await create.ExecuteNonQueryAsync();
        try
        {
            var configured = new NpgsqlConnectionStringBuilder(connection) { SearchPath = schema };
            var options = new DbContextOptionsBuilder<PeladaDb>().UseNpgsql(configured.ConnectionString,
                postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", schema)).Options;
            await using var db = new PeladaDb(options);
            var migrator = db.GetService<IMigrator>();
            await migrator.MigrateAsync(db.Database.GetMigrations().First());
            var hasher = new PasswordHasher<Organizer>();
            var names = new[] { "rico", "Rico@example.test", "rico@other.test", "++@tiny.test" };
            foreach (var name in names)
            {
                var user = new Organizer { Id = Guid.NewGuid().ToString(), Name = "Legado", UserName = name,
                    NormalizedUserName = name.ToUpperInvariant(), Email = name.Contains('@') ? name : null,
                    SecurityStamp = Guid.NewGuid().ToString(), ConcurrencyStamp = Guid.NewGuid().ToString() };
                user.PasswordHash = hasher.HashPassword(user, "Synthetic-legacy-password-123");
                db.Users.Add(user);
            }
            await db.SaveChangesAsync();
            var original = await db.Users.AsNoTracking().ToDictionaryAsync(u => u.Id, u => u.PasswordHash);
            db.ChangeTracker.Clear();
            await migrator.MigrateAsync();
            var migrated = await db.Users.AsNoTracking().ToListAsync();
            Assert.Equal(4, migrated.Count);
            Assert.All(migrated, u => Assert.True(Nickname.IsValid(u.UserName)));
            Assert.Equal(4, migrated.Select(u => u.NormalizedUserName).Distinct().Count());
            Assert.Contains(migrated, u => u.UserName == "rico");
            Assert.Contains(migrated, u => u.UserName == "rico_2");
            Assert.Contains(migrated, u => u.UserName == "rico_3");
            Assert.Contains(migrated, u => u.UserName == "organizador");
            Assert.All(migrated, u => Assert.Equal(original[u.Id], u.PasswordHash));
            Assert.All(migrated, u => Assert.Equal(PasswordVerificationResult.Success,
                hasher.VerifyHashedPassword(u, u.PasswordHash!, "Synthetic-legacy-password-123")));
        }
        finally
        {
            // Only this test's randomly named schema is removed.
            await using var drop = new NpgsqlCommand($"DROP SCHEMA {schema} CASCADE", admin);
            await drop.ExecuteNonQueryAsync();
        }
    }
}
