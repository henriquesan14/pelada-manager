namespace Pelada.Api;

public static class S3PhotoProbe
{
    public static async Task<int> RunAsync(IPhotoObjectStore objects, TextWriter output)
    {
        var data = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=");
        PhotoObjectLocation? uploaded = null;
        var success = false;
        try
        {
            uploaded = await objects.PutAsync("_verificacao", data, "image/png");
            var downloaded = await objects.GetAsync(uploaded);
            success = downloaded.AsSpan().SequenceEqual(data);
        }
        catch { await output.WriteLineAsync("Falha no teste S3. Confira região, bucket, credenciais e permissões GetObject/PutObject/DeleteObject."); }
        finally
        {
            if (uploaded is not null)
            {
                try { await objects.DeleteAsync(uploaded); }
                catch { success = false; await output.WriteLineAsync($"Não foi possível remover o objeto de teste: {uploaded.Key}"); }
            }
        }
        if (success) await output.WriteLineAsync("S3 verificado: envio, leitura e exclusão do arquivo de teste concluídos.");
        else await output.WriteLineAsync("O teste S3 não foi concluído com sucesso. Nenhuma credencial foi exibida.");
        return success ? 0 : 1;
    }
}
