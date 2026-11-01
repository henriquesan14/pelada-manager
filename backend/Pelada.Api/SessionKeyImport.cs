using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Pelada.Api;

public static class SessionKeyImport
{
    // Preserve existing cookies when a former filesystem key ring is still available.
    public static async Task ImportAsync(PeladaDb db,string directory)
    {
        if(!Directory.Exists(directory))return;
        var existing=(await db.DataProtectionKeys.Select(key=>key.Xml).ToListAsync()).ToHashSet();
        foreach(var path in Directory.EnumerateFiles(directory,"*.xml"))
        {
            var xml=XElement.Load(path);
            if(xml.Name.LocalName is not ("key" or "revocation"))continue;
            var value=xml.ToString(SaveOptions.DisableFormatting);
            if(!existing.Add(value))continue;
            db.DataProtectionKeys.Add(new DataProtectionKey{FriendlyName=Path.GetFileNameWithoutExtension(path),Xml=value});
        }
        if(db.ChangeTracker.HasChanges())await db.SaveChangesAsync();
    }
}
