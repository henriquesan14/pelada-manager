using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Pelada.Api;

public sealed class Organizer : IdentityUser
{
    public string Name { get; set; } = "";
    public bool IsOwner { get; set; }
    public bool IsActive { get; set; } = true;
}
public sealed class Invitation
{
    public string Hash { get; set; } = "";
    public string CreatedBy { get; set; } = "";
    public DateTimeOffset Expires { get; set; }
    public int RemainingUses { get; set; }
}
public sealed class StateDocument
{
    public int Id { get; set; } = 1;
    public long Revision { get; set; }
    public string Payload { get; set; } = "{\"players\":[],\"teams\":[],\"matches\":[]}";
}
public sealed class Activity
{
    public long Id { get; set; }
    public string ActorId { get; set; } = "";
    public string ActorName { get; set; } = "";
    public string Action { get; set; } = "";
    public DateTimeOffset Date { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class RentalPhoto
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string RentalId { get; set; } = "";
    public string ContentType { get; set; } = "";
    public byte[] Data { get; set; } = [];
    public string? ObjectKey { get; set; }
    public string? BucketName { get; set; }
    public string? Region { get; set; }
    public string UploadedBy { get; set; } = "";
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class PeladaDb(DbContextOptions<PeladaDb> options) : IdentityDbContext<Organizer>(options), IDataProtectionKeyContext
{
    public DbSet<DataProtectionKey> DataProtectionKeys { get; set; } = null!;
    public DbSet<Invitation> Invitations => Set<Invitation>();
    public DbSet<StateDocument> Pelada => Set<StateDocument>();
    public DbSet<Activity> Activities => Set<Activity>();
    public DbSet<RentalPhoto> RentalPhotos => Set<RentalPhoto>();
    protected override void OnModelCreating(ModelBuilder model)
    {
        base.OnModelCreating(model);
        model.Entity<Organizer>().Property(u => u.Name).HasMaxLength(50);
        model.Entity<Invitation>().HasKey(i => i.Hash);
        model.Entity<Invitation>().Property(i => i.Hash).HasMaxLength(64);
        model.Entity<Invitation>().HasOne<Organizer>().WithMany().HasForeignKey(i => i.CreatedBy).OnDelete(DeleteBehavior.Restrict);
        model.Entity<StateDocument>().Property(s => s.Revision).IsConcurrencyToken();
        model.Entity<StateDocument>().Property(s => s.Payload).HasColumnType("jsonb");
        model.Entity<StateDocument>().HasData(new StateDocument());
        model.Entity<Activity>().Property(a => a.ActorName).HasMaxLength(50);
        model.Entity<Activity>().Property(a => a.Action).HasMaxLength(250);
        model.Entity<Activity>().HasIndex(a => a.Date);
        model.Entity<RentalPhoto>().HasIndex(p => p.RentalId).IsUnique();
        model.Entity<RentalPhoto>().Property(p => p.ContentType).HasMaxLength(30);
    }
}
